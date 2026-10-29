package local.braincode.dashboard;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private final JdbcTemplate jdbc;

    public DashboardController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    Map<String, Object> dashboard() {
        LocalDate today = LocalDate.now(ZONE);
        String todayText = today.toString();
        List<Map<String, Object>> learning = jdbc.queryForList(
                "SELECT t.id,t.task_date,t.day_number,t.minutes,t.content,p.title AS plan_title " +
                        "FROM learning_tasks t JOIN study_plans p ON p.id=t.plan_id " +
                        "WHERE t.task_date<=? AND t.done=0 AND p.status='ACTIVE' ORDER BY t.task_date,t.day_number LIMIT 30", todayText);
        List<Map<String, Object>> reviews = jdbc.queryForList(
                "SELECT c.id,c.note_id,c.prompt,c.due_at,n.title AS note_title FROM review_cards c " +
                        "JOIN notes n ON n.id=c.note_id WHERE c.due_at<=? AND c.suspended=0 ORDER BY c.due_at LIMIT 30",
                today.atTime(23, 59, 59).atZone(ZONE).toInstant().toString());
        List<Map<String, Object>> records = jdbc.queryForList(
                "SELECT id,record_date,body,created_at FROM daily_records WHERE record_date=? ORDER BY created_at DESC", todayText);
        List<Map<String, Object>> calendar = jdbc.queryForList(
                "SELECT day AS date, SUM(learning_count) AS learning, SUM(review_count) AS reviews FROM (" +
                        "SELECT substr(task_date,1,10) AS day,COUNT(*) AS learning_count,0 AS review_count FROM learning_tasks WHERE done=1 AND task_date>=? GROUP BY day " +
                        "UNION ALL SELECT substr(datetime(reviewed_at,'+8 hours'),1,10) AS day,0 AS learning_count,COUNT(*) AS review_count FROM review_logs WHERE reviewed_at>=? GROUP BY day" +
                        ") GROUP BY day ORDER BY day", today.minusDays(89).toString(), today.minusDays(89).toString());
        return Map.of("date", todayText, "learningTasks", learning, "reviewTasks", reviews,
                "records", records, "calendar", calendar,
                "stats", Map.of("notes", jdbc.queryForObject("SELECT COUNT(*) FROM notes", Integer.class),
                        "reviewsToday", jdbc.queryForObject("SELECT COUNT(*) FROM review_logs WHERE substr(datetime(reviewed_at,'+8 hours'),1,10)=?", Integer.class, todayText),
                        "learningDone", jdbc.queryForObject("SELECT COUNT(*) FROM learning_tasks WHERE done=1 AND task_date=?", Integer.class, todayText)));
    }

    @PostMapping("/records")
    Map<String, String> addRecord(@RequestBody Map<String, String> input) {
        String body = input.getOrDefault("body", "").trim();
        if (body.isBlank()) throw new IllegalArgumentException("记录内容不能为空");
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO daily_records(id,record_date,body,created_at) VALUES(?,?,?,?)",
                id, LocalDate.now(ZONE).toString(), body, java.time.Instant.now().toString());
        return Map.of("id", id, "created", "true");
    }

    @PostMapping("/tasks/{id}/complete")
    Map<String, Boolean> completeTask(@PathVariable String id) {
        int changed = jdbc.update("UPDATE learning_tasks SET done=1 WHERE id=?", id);
        if (changed == 0) throw new IllegalArgumentException("找不到这项学习任务");
        return Map.of("completed", true);
    }
}
