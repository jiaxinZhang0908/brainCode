package local.braincode.dashboard;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.DayOfWeek;
import java.time.temporal.TemporalAdjusters;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private final JdbcTemplate jdbc;

    public DashboardController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
        // Keep existing local databases compatible with image records.
        try { jdbc.execute("ALTER TABLE daily_records ADD COLUMN image_data TEXT NOT NULL DEFAULT ''"); }
        catch (org.springframework.dao.DataAccessException alreadyMigrated) {
            if (alreadyMigrated.getMessage() == null || !alreadyMigrated.getMessage().toLowerCase().contains("duplicate column")) throw alreadyMigrated;
        }
    }

    @GetMapping
    Map<String, Object> dashboard(@RequestParam(required = false) String week) {
        LocalDate today = LocalDate.now(ZONE);
        String todayText = today.toString();
        LocalDate weekStart = week == null || week.isBlank()
                ? today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                : LocalDate.parse(week).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate weekEnd = weekStart.plusDays(7);
        List<Map<String, Object>> learning = jdbc.queryForList(
                "SELECT t.id,t.task_date,t.day_number,t.minutes,t.content,p.title AS plan_title " +
                        "FROM learning_tasks t JOIN study_plans p ON p.id=t.plan_id " +
                        "WHERE t.task_date<=? AND t.done=0 AND p.status='ACTIVE' ORDER BY t.task_date,t.day_number LIMIT 30", todayText);
        List<Map<String, Object>> reviews = jdbc.queryForList(
                "SELECT c.id,c.note_id,c.prompt,c.due_at,n.title AS note_title FROM review_cards c " +
                        "JOIN notes n ON n.id=c.note_id WHERE c.due_at<=? AND c.suspended=0 ORDER BY c.due_at LIMIT 30",
                today.atTime(23, 59, 59).atZone(ZONE).toInstant().toString());
        List<Map<String, Object>> weekTasks = new java.util.ArrayList<>();
        List<Map<String, Object>> plannedLearning = jdbc.queryForList(
                "SELECT t.id,t.task_date,t.day_number,t.minutes,t.content,t.done,p.title AS plan_title " +
                        "FROM learning_tasks t JOIN study_plans p ON p.id=t.plan_id " +
                        "WHERE t.task_date>=? AND t.task_date<? AND p.status='ACTIVE' ORDER BY t.task_date,t.day_number",
                weekStart.toString(), weekEnd.toString());
        plannedLearning.forEach(task -> weekTasks.add(Map.of(
                "id", task.get("id"), "type", "learning", "date", task.get("task_date"),
                "title", task.get("plan_title"), "content", task.get("content"),
                "minutes", task.get("minutes"), "done", task.get("done"), "dayNumber", task.get("day_number"))));
        String weekStartAt = weekStart.atStartOfDay(ZONE).toInstant().toString();
        String weekEndAt = weekEnd.atStartOfDay(ZONE).toInstant().toString();
        List<Map<String, Object>> plannedReviews = jdbc.queryForList(
                "SELECT c.id,c.note_id,c.prompt,c.due_at,n.title AS note_title FROM review_cards c " +
                        "JOIN notes n ON n.id=c.note_id WHERE c.due_at>=? AND c.due_at<? AND c.suspended=0 ORDER BY c.due_at",
                weekStartAt, weekEndAt);
        plannedReviews.forEach(task -> weekTasks.add(Map.of(
                "id", task.get("id"), "type", "review", "date", task.get("due_at").toString().substring(0, 10),
                "title", task.get("note_title"), "content", task.get("prompt"), "minutes", 15, "done", 0,
                "dayNumber", 0)));
        weekTasks.sort(java.util.Comparator.comparing(task -> task.get("date").toString()));
        List<Map<String, Object>> records = jdbc.queryForList(
                "SELECT id,record_date,body,image_data,created_at FROM daily_records WHERE record_date=? ORDER BY created_at DESC", todayText);
        List<Map<String, Object>> calendar = jdbc.queryForList(
                "SELECT day AS date, SUM(learning_count) AS learning, SUM(review_count) AS reviews FROM (" +
                        "SELECT substr(task_date,1,10) AS day,COUNT(*) AS learning_count,0 AS review_count FROM learning_tasks WHERE done=1 AND task_date>=? GROUP BY day " +
                        "UNION ALL SELECT substr(datetime(reviewed_at,'+8 hours'),1,10) AS day,0 AS learning_count,COUNT(*) AS review_count FROM review_logs WHERE reviewed_at>=? GROUP BY day" +
                        ") GROUP BY day ORDER BY day", today.minusDays(89).toString(), today.minusDays(89).toString());
        return Map.of("date", todayText, "weekStart", weekStart.toString(), "weekTasks", weekTasks,
                "learningTasks", learning, "reviewTasks", reviews,
                "records", records, "calendar", calendar,
                "stats", Map.of("notes", jdbc.queryForObject("SELECT COUNT(*) FROM notes", Integer.class),
                        "reviewsToday", jdbc.queryForObject("SELECT COUNT(*) FROM review_logs WHERE substr(datetime(reviewed_at,'+8 hours'),1,10)=?", Integer.class, todayText),
                        "learningDone", jdbc.queryForObject("SELECT COUNT(*) FROM learning_tasks WHERE done=1 AND task_date=?", Integer.class, todayText)));
    }

    @GetMapping("/records")
    List<Map<String, Object>> records() {
        return jdbc.queryForList("SELECT id,record_date,body,image_data,created_at FROM daily_records ORDER BY created_at DESC LIMIT 100");
    }

    @PostMapping("/records")
    Map<String, String> addRecord(@RequestBody Map<String, String> input) {
        String body = input.getOrDefault("body", "").trim();
        String imageData = input.getOrDefault("imageData", "");
        if (body.isBlank() && imageData.isBlank()) throw new IllegalArgumentException("请填写记录内容或上传图片");
        if (!imageData.isBlank() && !imageData.matches("^data:image/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$"))
            throw new IllegalArgumentException("图片格式无效，请重新选择图片");
        if (imageData.length() > 6_000_000) throw new IllegalArgumentException("图片过大，请选择 4 MB 以内的图片");
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO daily_records(id,record_date,body,image_data,created_at) VALUES(?,?,?,?,?)",
                id, LocalDate.now(ZONE).toString(), body, imageData, java.time.Instant.now().toString());
        return Map.of("id", id, "created", "true");
    }

    @DeleteMapping("/records/{id}")
    Map<String, Boolean> deleteRecord(@PathVariable String id) {
        int deleted = jdbc.update("DELETE FROM daily_records WHERE id=?", id);
        if (deleted == 0) throw new IllegalArgumentException("这条记录已经不存在");
        return Map.of("deleted", true);
    }

    @PostMapping("/tasks/{id}/complete")
    Map<String, Boolean> completeTask(@PathVariable String id) {
        int changed = jdbc.update("UPDATE learning_tasks SET done=1 WHERE id=?", id);
        if (changed == 0) throw new IllegalArgumentException("找不到这项学习任务");
        return Map.of("completed", true);
    }
}
