package local.braincode.dashboard;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@org.springframework.web.bind.annotation.CrossOrigin(origins = {
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174"
})
@RequestMapping("/api/gallery")
public class GalleryController {
    private final JdbcTemplate jdbc;

    public GalleryController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    List<Map<String, Object>> list() {
        return jdbc.queryForList("SELECT id,image_data,caption,created_at FROM gallery_photos ORDER BY created_at DESC LIMIT 500");
    }

    @PostMapping
    Map<String, String> add(@RequestBody Map<String, String> input) {
        String imageData = input.getOrDefault("imageData", "");
        String caption = input.getOrDefault("caption", "").trim();
        if (!imageData.matches("^data:image/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$"))
            throw new IllegalArgumentException("照片格式无效，请重新选择图片");
        if (imageData.length() > 5_800_000) throw new IllegalArgumentException("照片压缩后仍然过大，请选一张较小的图片");
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO gallery_photos(id,image_data,caption,created_at) VALUES(?,?,?,?)",
                id, imageData, caption, Instant.now().toString());
        return Map.of("id", id, "caption", caption);
    }
}
