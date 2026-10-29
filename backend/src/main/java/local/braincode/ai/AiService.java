package local.braincode.ai;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

import java.util.List;
import java.util.Map;

@Service
public class AiService {
    @Value("${braincode.ai.provider}") private String defaultProvider;
    @Value("${braincode.ai.ollama-url}") private String ollamaUrl;
    @Value("${braincode.ai.ollama-model}") private String ollamaModel;
    @Value("${braincode.ai.deepseek-url}") private String deepSeekUrl;
    @Value("${braincode.ai.deepseek-model}") private String deepSeekModel;
    @Value("${braincode.ai.deepseek-key}") private String deepSeekKey;

    public record Completion(String provider, String model, String content) {}

    public Completion complete(String requestedProvider, String system, String prompt) {
        String provider = requestedProvider == null || requestedProvider.isBlank()
                ? defaultProvider : requestedProvider.trim().toLowerCase();
        return switch (provider) {
            case "ollama" -> ollama(system, prompt);
            case "deepseek" -> deepSeek(system, prompt);
            default -> throw new IllegalArgumentException("模型提供方仅支持 ollama 或 deepseek");
        };
    }

    private Completion ollama(String system, String prompt) {
        JsonNode response = client(ollamaUrl).post().uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("model", ollamaModel, "stream", false,
                        "messages", List.of(Map.of("role", "system", "content", system),
                                Map.of("role", "user", "content", prompt))))
                .retrieve().body(JsonNode.class);
        String content = response == null ? null : response.path("message").path("content").asText(null);
        if (content == null || content.isBlank()) throw new IllegalStateException("Ollama 未返回文本内容");
        return new Completion("ollama", ollamaModel, content);
    }

    private Completion deepSeek(String system, String prompt) {
        if (deepSeekKey == null || deepSeekKey.isBlank()) {
            throw new IllegalStateException("未设置 DEEPSEEK_API_KEY");
        }
        JsonNode response = client(deepSeekUrl).post().uri("/chat/completions")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + deepSeekKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("model", deepSeekModel,
                        "messages", List.of(Map.of("role", "system", "content", system),
                                Map.of("role", "user", "content", prompt))))
                .retrieve().body(JsonNode.class);
        String content = response == null ? null : response.path("choices").path(0)
                .path("message").path("content").asText(null);
        if (content == null || content.isBlank()) throw new IllegalStateException("DeepSeek 未返回文本内容");
        return new Completion("deepseek", deepSeekModel, content);
    }

    private RestClient client(String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(120_000);
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }
}
