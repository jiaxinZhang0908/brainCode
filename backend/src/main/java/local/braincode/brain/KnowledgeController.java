package local.braincode.brain;

import local.braincode.ai.AiService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {
    public record GraphNode(String id, String noteId, String label, String summary) {}
    public record GraphEdge(String id, String source, String target, String label, String sourceType) {}
    public record EdgeInput(String sourceNoteId, String targetNoteId, String relation) {}
    public record SuggestionInput(String noteId, String provider) {}

    private final JdbcTemplate jdbc;
    private final NoteService notes;
    private final AiService ai;

    public KnowledgeController(JdbcTemplate jdbc, NoteService notes, AiService ai) {
        this.jdbc = jdbc;
        this.notes = notes;
        this.ai = ai;
    }

    @GetMapping("/graph")
    Map<String, Object> graph(@RequestParam(required = false) String nodeId) {
        List<GraphNode> allNodes = jdbc.query("SELECT id,note_id,label,summary FROM knowledge_nodes ORDER BY label",
                (rs, row) -> new GraphNode(rs.getString("id"), rs.getString("note_id"),
                        rs.getString("label"), rs.getString("summary")));
        List<GraphEdge> allEdges = jdbc.query("SELECT id,source_id,target_id,relation,source_type FROM knowledge_edges",
                (rs, row) -> new GraphEdge(rs.getString("id"), rs.getString("source_id"),
                        rs.getString("target_id"), rs.getString("relation"), rs.getString("source_type")));
        if (nodeId == null || nodeId.isBlank()) return Map.of("nodes", allNodes, "edges", allEdges);
        var relatedIds = allEdges.stream().filter(e -> e.source().equals(nodeId) || e.target().equals(nodeId))
                .flatMap(e -> java.util.stream.Stream.of(e.source(), e.target())).collect(java.util.stream.Collectors.toSet());
        relatedIds.add(nodeId);
        return Map.of("nodes", allNodes.stream().filter(n -> relatedIds.contains(n.id())).toList(),
                "edges", allEdges.stream().filter(e -> relatedIds.contains(e.source()) && relatedIds.contains(e.target())).toList());
    }

    @PostMapping("/edges")
    Map<String, String> createEdge(@RequestBody EdgeInput input) {
        if (input.sourceNoteId() == null || input.targetNoteId() == null
                || input.sourceNoteId().equals(input.targetNoteId())) throw new IllegalArgumentException("请选择两个不同的知识节点");
        if (input.relation() == null || input.relation().isBlank()) throw new IllegalArgumentException("关系说明不能为空");
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO knowledge_edges(id,source_id,target_id,relation,source_type) VALUES(?,?,?,?, 'user')",
                id, input.sourceNoteId(), input.targetNoteId(), input.relation().trim());
        return Map.of("id", id, "created", "true");
    }

    @PostMapping("/suggestions")
    Map<String, Object> suggestions(@RequestBody SuggestionInput input) {
        NoteService.Note note = notes.get(input.noteId());
        List<String> context = notes.listAll().stream().filter(n -> !n.id().equals(note.id())).limit(16)
                .map(n -> {
                    NoteService.Note full = notes.get(n.id());
                    String excerpt = full.body().length() > 900 ? full.body().substring(0, 900) : full.body();
                    return "- id=" + n.id() + " | 标题=" + n.title() + " | 内容=" + excerpt;
                }).toList();
        String system = "你是个人知识库的关系分析助手。只根据给定资料提出可能的知识关联，不要编造用户未提供的事实。";
        String prompt = "请分析新笔记与已有笔记的联系。输出简洁中文列表，每项包含候选笔记 id、关系描述和理由；若没有明确联系就说明。"
                + "\n新笔记标题：" + note.title() + "\n新笔记内容：" + note.body()
                + "\n已有笔记：\n" + String.join("\n", context);
        AiService.Completion result = ai.complete(input.provider(), system, prompt);
        return Map.of("provider", result.provider(), "model", result.model(), "suggestions", result.content());
    }
}
