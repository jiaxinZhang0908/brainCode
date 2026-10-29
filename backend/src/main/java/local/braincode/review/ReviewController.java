package local.braincode.review;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/reviews")
public class ReviewController {
    public record CardInput(String noteId, String prompt, boolean hasStudied) {}
    public record AnswerInput(String rating) {}

    private final JdbcTemplate jdbc;
    private final FsrsReviewScheduler scheduler;

    public ReviewController(JdbcTemplate jdbc, FsrsReviewScheduler scheduler) {
        this.jdbc = jdbc;
        this.scheduler = scheduler;
    }

    @GetMapping
    List<Map<String, Object>> list(@RequestParam(defaultValue = "false") boolean all) {
        String sql = "SELECT c.id,c.note_id,c.prompt,c.due_at,c.created_at,c.was_studied,n.title AS note_title " +
                "FROM review_cards c JOIN notes n ON n.id=c.note_id WHERE c.suspended=0 " +
                (all ? "" : "AND c.due_at<=? ") + "ORDER BY c.due_at";
        return all ? jdbc.queryForList(sql) : jdbc.queryForList(sql, Instant.now().toString());
    }

    @PostMapping
    Map<String, Object> create(@RequestBody CardInput input) {
        if (input.noteId() == null || input.noteId().isBlank()) throw new IllegalArgumentException("请选择一条知识");
        if (input.prompt() == null || input.prompt().isBlank()) throw new IllegalArgumentException("复习问题不能为空");
        String noteTitle = jdbc.queryForObject("SELECT title FROM notes WHERE id=?", String.class, input.noteId());
        FsrsReviewScheduler.NewCard state = scheduler.createCard();
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        jdbc.update("INSERT INTO review_cards(id,note_id,prompt,fsrs_json,due_at,created_at,was_studied) VALUES(?,?,?,?,?,?,?)",
                id, input.noteId(), input.prompt().trim(), state.stateJson(), state.dueAt().toString(), now, input.hasStudied() ? 1 : 0);
        return Map.of("id", id, "noteId", input.noteId(), "noteTitle", noteTitle,
                "prompt", input.prompt().trim(), "dueAt", state.dueAt().toString(), "wasStudied", input.hasStudied());
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
        return Map.of("rating", result.rating(), "dueAt", result.dueAt().toString(),
                "dueLocalDate", result.dueLocalDate().toString());
    }
}
