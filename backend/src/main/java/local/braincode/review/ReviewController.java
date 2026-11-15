package local.braincode.review;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/reviews")
public class ReviewController {
    private static final ZoneId USER_ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter LOCAL_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX").withZone(USER_ZONE);
    public record CardInput(String noteId, String prompt, boolean hasStudied, Instant firstReviewAt) {}
    public record AnswerInput(String rating) {}

    private final JdbcTemplate jdbc;
    private final FsrsReviewScheduler scheduler;
    private final ObjectMapper json = new ObjectMapper();

    public ReviewController(JdbcTemplate jdbc, FsrsReviewScheduler scheduler) {
        this.jdbc = jdbc;
        this.scheduler = scheduler;
    }

    /** FSRS 推演在每次调用时结果会漂移，因此推演日程只在建卡/答题后重算一次并持久化，供时间线与卡片日程共用同一数据源。 */
    private List<Map<String, Object>> computeForecast(String stateJson, int count) {
        return scheduler.forecast(stateJson, count).stream()
                .map(item -> Map.<String, Object>of("due_at", item.dueAt().toString(), "due_local", LOCAL_FORMAT.format(item.dueAt()),
                        "due_date", item.dueAt().atZone(USER_ZONE).toLocalDate().toString(),
                        "stability", item.stability(), "retention", item.retention(), "interval_days", item.intervalDays()))
                .toList();
    }

    private void saveForecast(String cardId, String stateJson) {
        try {
            saveForecastItems(cardId, json.writeValueAsString(computeForecast(stateJson, 20)));
        } catch (Exception e) {
            throw new IllegalStateException("保存复习推演失败", e);
        }
    }

    private void saveForecastItems(String cardId, String itemsJson) {
        jdbc.update("INSERT INTO review_forecasts(card_id,items_json,updated_at) VALUES(?,?,?) " +
                        "ON CONFLICT(card_id) DO UPDATE SET items_json=excluded.items_json, updated_at=excluded.updated_at",
                cardId, itemsJson, Instant.now().toString());
    }

    private List<Map<String, Object>> storedForecast(String cardId, String stateJson) {
        List<String> stored = jdbc.queryForList("SELECT items_json FROM review_forecasts WHERE card_id=?", String.class, cardId);
        if (!stored.isEmpty()) {
            try {
                return json.readValue(stored.get(0), new TypeReference<List<Map<String, Object>>>() {});
            } catch (Exception ignored) {
            }
        }
        saveForecast(cardId, stateJson);
        return storedForecast(cardId, stateJson);
    }

    @GetMapping
    List<Map<String, Object>> list(@RequestParam(defaultValue = "false") boolean all) {
        String sql = "SELECT c.id,c.note_id,c.prompt,c.due_at,c.created_at,c.was_studied,c.suspended,n.title AS note_title, " +
                "COALESCE(l.review_count,0) AS review_count,l.last_reviewed_at " +
                "FROM review_cards c JOIN notes n ON n.id=c.note_id " +
                "LEFT JOIN (SELECT card_id,COUNT(*) AS review_count,MAX(reviewed_at) AS last_reviewed_at FROM review_logs GROUP BY card_id) l ON l.card_id=c.id " +
                "WHERE 1=1 " +
                (all ? "" : "AND c.suspended=0 AND c.due_at<=? ") + "ORDER BY c.due_at";
        return all ? jdbc.queryForList(sql) : jdbc.queryForList(sql, Instant.now().toString());
    }

    @PostMapping
    Map<String, Object> create(@RequestBody CardInput input) {
        if (input.noteId() == null || input.noteId().isBlank()) throw new IllegalArgumentException("请选择一条知识");
        if (input.prompt() == null || input.prompt().isBlank()) throw new IllegalArgumentException("复习问题不能为空");
        String noteTitle = jdbc.queryForObject("SELECT title FROM notes WHERE id=?", String.class, input.noteId());
        FsrsReviewScheduler.NewCard state = scheduler.createCard(input.firstReviewAt());
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        jdbc.update("INSERT INTO review_cards(id,note_id,prompt,fsrs_json,due_at,created_at,was_studied) VALUES(?,?,?,?,?,?,?)",
                id, input.noteId(), input.prompt().trim(), state.stateJson(), state.dueAt().toString(), now, input.hasStudied() ? 1 : 0);
        saveForecastItems(id, "[]");
        return Map.of("id", id, "noteId", input.noteId(), "noteTitle", noteTitle,
                "prompt", input.prompt().trim(), "dueAt", state.dueAt().toString(), "wasStudied", input.hasStudied());
    }

    @GetMapping("/schedule")
    Map<String, Object> schedule(@RequestParam(defaultValue = "14") int days) {
        int dayCount = Math.max(1, Math.min(days, 90));
        LocalDate today = LocalDate.now(USER_ZONE);
        Instant end = today.plusDays(dayCount).atStartOfDay(USER_ZONE).toInstant();
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT c.id,c.note_id,c.due_at,c.prompt,c.fsrs_json,n.title AS note_title FROM review_cards c " +
                        "JOIN notes n ON n.id=c.note_id WHERE c.suspended=0 AND c.due_at<? ORDER BY c.due_at", end.toString());
        Map<LocalDate, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (int i = 0; i < dayCount; i++) grouped.put(today.plusDays(i), new ArrayList<>());
        for (Map<String, Object> row : rows) {
            Instant dueAt = Instant.parse(String.valueOf(row.get("due_at")));
            LocalDate date = dueAt.atZone(USER_ZONE).toLocalDate();
            if (date.isBefore(today)) date = today;
            List<Map<String, Object>> list = grouped.get(date);
            if (list != null) list.add(Map.of("id", row.get("id"), "note_id", row.get("note_id"), "note_title", row.get("note_title"),
                    "prompt", row.get("prompt"), "due_at", dueAt.toString(), "due_local", LOCAL_FORMAT.format(dueAt),
                    "due_date", date.toString(), "predicted", false));
            String fsrsState = String.valueOf(row.get("fsrs_json"));
            for (Map<String, Object> forecast : storedForecast(String.valueOf(row.get("id")), fsrsState).stream().limit(5).toList()) {
                LocalDate forecastDate = LocalDate.parse(String.valueOf(forecast.get("due_date")));
                List<Map<String, Object>> forecastDay = grouped.get(forecastDate);
                if (forecastDay == null) continue;
                forecastDay.add(Map.of("id", row.get("id"), "note_id", row.get("note_id"), "note_title", row.get("note_title"),
                        "prompt", row.get("prompt"), "due_at", forecast.get("due_at"), "due_local", forecast.get("due_local"),
                        "due_date", forecastDate.toString(), "predicted", true, "interval_days", forecast.get("interval_days")));
            }
        }
        List<Map<String, Object>> result = grouped.entrySet().stream()
                .map(entry -> {
                    List<Map<String, Object>> allCards = entry.getValue();
                    int realCount = (int) allCards.stream().filter(c -> !Boolean.TRUE.equals(c.get("predicted"))).count();
                    return Map.<String, Object>of("date", entry.getKey().toString(), "count", realCount, "cards", allCards);
                })
                .toList();
        return Map.of("days", result, "today", today.toString());
    }

    @GetMapping("/{id}/forecast")
    Map<String, Object> forecast(@PathVariable String id, @RequestParam(defaultValue = "5") int count) {
        int itemCount = Math.max(1, Math.min(count, 20));
        String stateJson = jdbc.queryForObject("SELECT fsrs_json FROM review_cards WHERE id=? AND suspended=0", String.class, id);
        List<Map<String, Object>> stored = storedForecast(id, stateJson);
        List<Map<String, Object>> items = stored.subList(0, Math.min(itemCount, stored.size()));
        return Map.of("cardId", id, "items", items);
    }

    @PostMapping("/{id}/answer")
    Map<String, Object> answer(@PathVariable String id, @RequestBody AnswerInput input) {
        Map<String, Object> row = jdbc.queryForMap("SELECT fsrs_json FROM review_cards WHERE id=? AND suspended=0", id);
        String rating = input.rating() == null ? "" : input.rating();
        FsrsReviewScheduler.ReviewResult result = scheduler.answer((String) row.get("fsrs_json"), rating);
        String now = Instant.now().toString();
        jdbc.update("UPDATE review_cards SET fsrs_json=?,due_at=? WHERE id=?",
                result.stateJson(), result.dueAt().toString(), id);
        jdbc.update("INSERT INTO review_logs(id,card_id,rating,reviewed_at,due_after) VALUES(?,?,?,?,?)",
                UUID.randomUUID().toString(), id, result.rating(), now, result.dueAt().toString());
        saveForecast(id, result.stateJson());
        return Map.of("rating", result.rating(), "dueAt", result.dueAt().toString(),
                "dueLocalDate", result.dueLocalDate().toString());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void delete(@PathVariable String id) {
        jdbc.update("DELETE FROM review_logs WHERE card_id=?", id);
        jdbc.update("DELETE FROM review_cards WHERE id=?", id);
    }

    @PostMapping("/{id}/suspend")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void suspend(@PathVariable String id) { jdbc.update("UPDATE review_cards SET suspended=1 WHERE id=?", id); }

    @PostMapping("/{id}/resume")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void resume(@PathVariable String id) { jdbc.update("UPDATE review_cards SET suspended=0 WHERE id=?", id); }
}
