package local.braincode.brain;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class NoteService {
    public record Note(String id, String title, String body, String createdAt, String updatedAt) {}
    public record NoteSummary(String id, String title, String createdAt, String updatedAt) {}

    private final JdbcTemplate jdbc;
    private final LocalNoteIndex index;
    private final Path notesPath;

    public NoteService(JdbcTemplate jdbc, LocalNoteIndex index,
                       @Value("${braincode.notes-dir}") String notesPath) {
        this.jdbc = jdbc;
        this.index = index;
        this.notesPath = Path.of(notesPath).toAbsolutePath().normalize();
    }

    @PostConstruct
    void rebuildIndex() throws Exception {
        Files.createDirectories(notesPath);
        index.clear();
        List<NoteSummary> notes = listAll();
        for (NoteSummary note : notes) {
            Path file = noteFile(note.id());
            if (Files.exists(file)) index.put(note.id(), note.title(), Files.readString(file));
        }
    }

    public List<NoteSummary> listAll() {
        return jdbc.query("SELECT id,title,created_at,updated_at FROM notes ORDER BY updated_at DESC",
                (rs, row) -> new NoteSummary(rs.getString("id"), rs.getString("title"),
                        rs.getString("created_at"), rs.getString("updated_at")));
    }

    public List<NoteSummary> search(String query) {
        if (query == null || query.isBlank()) return listAll();
        List<String> ids = index.search(query, 50);
        if (ids.isEmpty()) return List.of();
        Map<String, NoteSummary> byId = listAll().stream().collect(java.util.stream.Collectors.toMap(NoteSummary::id, n -> n));
        return ids.stream().map(byId::get).filter(java.util.Objects::nonNull).toList();
    }

    public Note get(String id) {
        NoteSummary summary = jdbc.queryForObject(
                "SELECT id,title,created_at,updated_at FROM notes WHERE id = ?",
                (rs, row) -> new NoteSummary(rs.getString("id"), rs.getString("title"),
                        rs.getString("created_at"), rs.getString("updated_at")), id);
        try {
            return new Note(summary.id(), summary.title(), Files.readString(noteFile(id)), summary.createdAt(), summary.updatedAt());
        } catch (Exception e) {
            throw new IllegalStateException("无法读取 Markdown 笔记", e);
        }
    }

    public Note create(String title, String body) {
        String safeTitle = cleanTitle(title);
        String content = body == null ? "" : body;
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        Path file = noteFile(id);
        try {
            Files.createDirectories(notesPath);
            Files.writeString(file, content);
            jdbc.update("INSERT INTO notes(id,title,file_name,created_at,updated_at) VALUES(?,?,?,?,?)",
                    id, safeTitle, id + ".md", now, now);
            jdbc.update("INSERT INTO knowledge_nodes(id,note_id,label,summary) VALUES(?,?,?,?)",
                    id, id, safeTitle, "");
            index.put(id, safeTitle, content);
            return get(id);
        } catch (Exception e) {
            try { Files.deleteIfExists(file); } catch (Exception ignored) { }
            throw new IllegalStateException("无法创建 Markdown 笔记", e);
        }
    }

    public Note update(String id, String title, String body) {
        String safeTitle = cleanTitle(title);
        String content = body == null ? "" : body;
        String now = Instant.now().toString();
        try {
            Files.writeString(noteFile(id), content);
            int changed = jdbc.update("UPDATE notes SET title=?,updated_at=? WHERE id=?", safeTitle, now, id);
            if (changed == 0) throw new IllegalArgumentException("找不到这条笔记");
            jdbc.update("UPDATE knowledge_nodes SET label=? WHERE note_id=?", safeTitle, id);
            index.put(id, safeTitle, content);
            return get(id);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("无法更新 Markdown 笔记", e);
        }
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM notes WHERE id=?", id);
        index.delete(id);
        try { Files.deleteIfExists(noteFile(id)); }
        catch (Exception e) { throw new IllegalStateException("笔记记录已删除，但 Markdown 文件未能删除", e); }
    }

    private Path noteFile(String id) {
        if (id == null || !id.matches("[0-9a-fA-F-]{36}")) throw new IllegalArgumentException("无效的笔记 ID");
        return notesPath.resolve(id + ".md").normalize();
    }

    private String cleanTitle(String title) {
        if (title == null || title.isBlank()) throw new IllegalArgumentException("标题不能为空");
        return title.trim();
    }
}
