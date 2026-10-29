package local.braincode.calendar;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import net.fortuna.ical4j.data.CalendarBuilder;
import net.fortuna.ical4j.data.CalendarOutputter;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.ZoneOffset;
import java.nio.charset.StandardCharsets;
import java.io.ByteArrayOutputStream;
import java.io.StringReader;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/calendar")
public class CalendarController {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter ICS_DATE = DateTimeFormatter.BASIC_ISO_DATE;
    private static final DateTimeFormatter ICS_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
    private final JdbcTemplate jdbc;

    public CalendarController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping(value = "/export.ics", produces = "text/calendar;charset=UTF-8")
    ResponseEntity<String> export() {
        LocalDate from = LocalDate.now(ZONE);
        LocalDate through = from.plusDays(90);
        StringBuilder ics = new StringBuilder("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BrainCode//Learning Garden//ZH\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n");

        List<Map<String, Object>> learning = jdbc.queryForList(
                "SELECT t.id,t.task_date,t.minutes,t.content,p.title FROM learning_tasks t " +
                        "JOIN study_plans p ON p.id=t.plan_id WHERE t.done=0 AND p.status='ACTIVE' AND t.task_date BETWEEN ? AND ?",
                from.toString(), through.toString());
        for (Map<String, Object> task : learning) {
            LocalDate date = LocalDate.parse(String.valueOf(task.get("task_date")));
            appendEvent(ics, String.valueOf(task.get("id")), date,
                    "学习 · " + task.get("title") + "（" + task.get("minutes") + " 分钟）",
                    String.valueOf(task.get("content")));
        }

        List<Map<String, Object>> reviews = jdbc.queryForList(
                "SELECT c.id,c.due_at,c.prompt,n.title FROM review_cards c JOIN notes n ON n.id=c.note_id " +
                        "WHERE c.suspended=0 AND c.due_at>=? AND c.due_at<=?",
                from.atStartOfDay(ZONE).toInstant().toString(), through.plusDays(1).atStartOfDay(ZONE).toInstant().toString());
        for (Map<String, Object> review : reviews) {
            LocalDate date = Instant.parse(String.valueOf(review.get("due_at"))).atZone(ZONE).toLocalDate();
            appendEvent(ics, String.valueOf(review.get("id")), date,
                    "复习 · " + review.get("title"), String.valueOf(review.get("prompt")));
        }
        ics.append("END:VCALENDAR\r\n");
        String calendarText;
        try {
            var calendar = new CalendarBuilder().build(new StringReader(ics.toString()));
            var output = new ByteArrayOutputStream();
            new CalendarOutputter().output(calendar, output);
            calendarText = output.toString(StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("无法生成 iCalendar 文件", e);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=braincode-learning.ics")
                .contentType(MediaType.parseMediaType("text/calendar;charset=UTF-8"))
                .body(calendarText);
    }

    private void appendEvent(StringBuilder ics, String id, LocalDate date, String title, String description) {
        String uid = id.replace("-", "") + "@braincode.local";
        appendLine(ics, "BEGIN:VEVENT");
        appendLine(ics, "UID:" + uid);
        appendLine(ics, "DTSTAMP:" + ICS_STAMP.format(Instant.now()));
        appendLine(ics, "DTSTART;VALUE=DATE:" + ICS_DATE.format(date));
        appendLine(ics, "DTEND;VALUE=DATE:" + ICS_DATE.format(date.plusDays(1)));
        appendLine(ics, "SUMMARY:" + escape(title));
        appendLine(ics, "DESCRIPTION:" + escape(description));
        appendLine(ics, "END:VEVENT");
    }

    private void appendLine(StringBuilder target, String line) {
        StringBuilder segment = new StringBuilder();
        int octets = 0;
        for (int offset = 0; offset < line.length();) {
            int codePoint = line.codePointAt(offset);
            String chars = new String(Character.toChars(codePoint));
            int size = chars.getBytes(StandardCharsets.UTF_8).length;
            if (octets + size > 75) {
                target.append(segment).append("\r\n ");
                segment.setLength(0);
                octets = 1;
            }
            segment.append(chars);
            octets += size;
            offset += Character.charCount(codePoint);
        }
        target.append(segment).append("\r\n");
    }

    private String escape(String value) {
        return value.replace("\\", "\\\\").replace("\r\n", "\\n").replace("\n", "\\n")
                .replace(",", "\\,").replace(";", "\\;");
    }
}
