package local.braincode;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

import java.nio.file.Files;
import java.nio.file.Path;

@SpringBootApplication
@ConfigurationPropertiesScan
public class BrainCodeApplication {
    public static void main(String[] args) {
        try {
            Files.createDirectories(Path.of("./data"));
        } catch (java.io.IOException e) {
            throw new IllegalStateException("无法创建本地 data 目录", e);
        }
        SpringApplication.run(BrainCodeApplication.class, args);
    }
}
