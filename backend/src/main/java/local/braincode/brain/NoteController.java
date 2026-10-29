package local.braincode.brain;

import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.HtmlRenderer;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notes")
public class NoteController {
    public record NoteInput(String title, String body) {}
    private final NoteService notes;
    private final Parser markdownParser = Parser.builder().build();
    private final HtmlRenderer htmlRenderer = HtmlRenderer.builder().escapeHtml(true).build();

    public NoteController(NoteService notes) { this.notes = notes; }

    @GetMapping
    List<NoteService.NoteSummary> list(@RequestParam(required = false) String q) { return notes.search(q); }

    @GetMapping("/{id}")
    Map<String, Object> get(@PathVariable String id) {
        NoteService.Note note = notes.get(id);
        return Map.of("id", note.id(), "title", note.title(), "body", note.body(),
                "html", htmlRenderer.render(markdownParser.parse(note.body())),
                "createdAt", note.createdAt(), "updatedAt", note.updatedAt());
    }

    @PostMapping
    NoteService.Note create(@RequestBody NoteInput input) { return notes.create(input.title(), input.body()); }

    @PutMapping("/{id}")
    NoteService.Note update(@PathVariable String id, @RequestBody NoteInput input) {
        return notes.update(id, input.title(), input.body());
    }

    @DeleteMapping("/{id}")
    Map<String, Boolean> delete(@PathVariable String id) { notes.delete(id); return Map.of("deleted", true); }
}
