package local.braincode.plans;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import local.braincode.ai.AiService;
import local.braincode.brain.NoteService;
import local.braincode.review.FsrsReviewScheduler;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/plans")
public class PlanController {
    public record DraftInput(String noteId, int days, String mastery, String provider) {}
    private static final ZoneId USER_ZONE = ZoneId.of("Asia/Shanghai");
    private final JdbcTemplate jdbc;
    private final NoteService notes;
    private final AiService ai;
    private final FsrsReviewScheduler reviewScheduler;
    private final ObjectMapper mapper;

    public PlanController(JdbcTemplate jdbc, NoteService notes, AiService ai,
                          FsrsReviewScheduler reviewScheduler, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.notes = notes;
        this.ai = ai;
        this.reviewScheduler = reviewScheduler;
        this.mapper = mapper;
    }

    @GetMapping
    List<Map<String, Object>> list() {
        return jdbc.queryForList("SELECT id,note_id,title,days,mastery,status,created_at FROM study_plans ORDER BY created_at DESC");
    }

    @PostMapping("/drafts")
    Map<String, Object> createDraft(@RequestBody DraftInput input) throws Exception {
        if (input.days() < 1 || input.days() > 180) throw new IllegalArgumentException("计划天数需要在 1 到 180 天之间");
        if (input.mastery() == null || input.mastery().isBlank()) throw new IllegalArgumentException("请说明期望掌握程度");
        NoteService.Note note = notes.get(input.noteId());
        String body = note.body().length() > 8000 ? note.body().substring(0, 8000) : note.body();
        List<String> context = notes.listAll().stream().filter(n -> !n.id().equals(note.id())).limit(12)
                .map(n -> n.id() + " | " + n.title()).toList();
        List<String> existingReviews = jdbc.query(
                "SELECT n.title,c.due_at FROM review_cards c JOIN notes n ON n.id=c.note_id " +
                        "WHERE c.suspended=0 AND c.due_at<=? ORDER BY c.due_at LIMIT 30",
                (rs, row) -> rs.getString("title") + "（" + rs.getString("due_at") + "）",
                java.time.Instant.now().plusSeconds(input.days() * 86400L).toString());
        String system = "你是学习计划助手。只基于提供的笔记规划。返回严格 JSON，不要使用 Markdown 代码块或额外说明。";
        String prompt = "根据新知识及关联旧知识制定学习计划。计划共 " + input.days() + " 天，目标掌握程度：" + input.mastery()
                + "。每天的 minutes 为学习总分钟数，focus 是当日目标，tasks 是字符串数组；安排循序渐进、包含回忆练习和适量复习。"
                + "\nJSON 格式：{\"days\":[{\"day\":1,\"minutes\":30,\"focus\":\"...\",\"tasks\":[\"...\"]}]}"
                + "\n新知识：" + note.title() + "\n" + body + "\n已有知识标题：\n" + String.join("\n", context)
                + "\n计划周期内已排定的复习（请合理安排负荷）：\n" + String.join("\n", existingReviews);
        AiService.Completion completion = ai.complete(input.provider(), system, prompt);
        JsonNode plan = parseJson(completion.content());
        JsonNode planDays = plan.path("days");
        if (!planDays.isArray() || planDays.size() != input.days()) {
            throw new IllegalStateException("模型返回的计划天数不符合要求，请重新生成");
        }
        for (JsonNode day : planDays) {
            int minutes = day.path("minutes").asInt(-1);
            if (minutes < 0 || minutes > 720 || day.path("focus").asText("").isBlank()) {
                throw new IllegalStateException("模型返回的计划字段不完整，请重新生成");
            }
        }
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO study_plans(id,note_id,title,days,mastery,plan_json,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
                id, note.id(), note.title(), input.days(), input.mastery().trim(), mapper.writeValueAsString(plan),
                "DRAFT", java.time.Instant.now().toString());
        return Map.of("id", id, "title", note.title(), "days", input.days(), "mastery", input.mastery(),
                "provider", completion.provider(), "model", completion.model(), "plan", plan);
    }

    @PostMapping("/{id}/confirm")
    @Transactional
    public Map<String, Object> confirm(@PathVariable String id) throws Exception {
        Map<String, Object> saved = jdbc.queryForMap("SELECT plan_json,status FROM study_plans WHERE id=?", id);
        if (!"DRAFT".equals(saved.get("status"))) throw new IllegalArgumentException("只有草案可以确认");
        JsonNode plan = mapper.readTree((String) saved.get("plan_json"));
        LocalDate start = LocalDate.now(USER_ZONE);
        int dayNumber = 0;
        for (JsonNode day : plan.path("days")) {
            dayNumber++;
            int minutes = day.path("minutes").asInt();
            String focus = day.path("focus").asText();
            String taskText = day.path("tasks").isArray()
                    ? joinTasks(day.path("tasks")) : "";
            String content = taskText.isBlank() ? focus : focus + "\n" + taskText;
            jdbc.update("INSERT INTO learning_tasks(id,plan_id,task_date,day_number,minutes,content,done) VALUES(?,?,?,?,?,?,0)",
                    UUID.randomUUID().toString(), id, start.plusDays(dayNumber - 1).toString(), dayNumber, minutes, content);
        }
        String noteId = jdbc.queryForObject("SELECT note_id FROM study_plans WHERE id=?", String.class, id);
        Integer existingCard = jdbc.queryForObject("SELECT COUNT(*) FROM review_cards WHERE note_id=? AND suspended=0", Integer.class, noteId);
        if (existingCard != null && existingCard == 0) {
            FsrsReviewScheduler.NewCard card = reviewScheduler.createCard();
            String noteTitle = jdbc.queryForObject("SELECT title FROM notes WHERE id=?", String.class, noteId);
            jdbc.update("INSERT INTO review_cards(id,note_id,prompt,fsrs_json,due_at,created_at,was_studied) VALUES(?,?,?,?,?,?,0)",
                    UUID.randomUUID().toString(), noteId, "用自己的话解释：" + noteTitle,
                    card.stateJson(), card.dueAt().toString(), java.time.Instant.now().toString());
        }
        jdbc.update("UPDATE study_plans SET status='ACTIVE' WHERE id=?", id);
        return Map.of("id", id, "status", "ACTIVE", "startDate", start.toString(), "days", dayNumber);
    }

    private JsonNode parseJson(String value) throws Exception {
        String json = value.trim();
        if (json.startsWith("```")) json = json.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        try { return mapper.readTree(json); }
        catch (Exception ignored) {
            int first = json.indexOf('{');
            int last = json.lastIndexOf('}');
            if (first < 0 || last <= first) throw new IllegalStateException("模型没有返回有效 JSON 计划");
            return mapper.readTree(json.substring(first, last + 1));
        }
    }

    private String joinTasks(JsonNode tasks) {
        java.util.List<String> values = new java.util.ArrayList<>();
        tasks.forEach(item -> { if (!item.asText().isBlank()) values.add("• " + item.asText()); });
        return String.join("\n", values);
    }
}
