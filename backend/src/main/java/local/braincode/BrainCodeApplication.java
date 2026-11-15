package local.braincode;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.nio.file.Files;
import java.nio.file.Path;

@SpringBootApplication
public class BrainCodeApplication {
    public static void main(String[] args) {
        // 数据目录与 application.properties 中的 braincode.data-dir 保持一致
        String configured = System.getenv("BRAINCODE_DATA_DIR");
        Path dataDir = Path.of(configured == null || configured.isBlank() ? "./data" : configured)
                .toAbsolutePath().normalize();
        try {
            Files.createDirectories(dataDir.resolve("notes"));
            Files.createDirectories(dataDir.resolve("lucene"));
        } catch (Exception e) {
            throw new IllegalStateException("无法创建数据目录：" + dataDir, e);
        }
        SpringApplication.run(BrainCodeApplication.class, args);
    }
}
