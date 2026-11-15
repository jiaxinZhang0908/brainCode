package local.braincode.ai;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

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

    /** 使用配置中的默认提供方。 */
    public Completion complete(String system, String prompt) {
        return complete(null, system, prompt);
    }

    public Completion complete(String requestedProvider, String system, String prompt) {
        return complete(requestedProvider, List.of(
                Map.of("role", "system", "content", system),
                Map.of("role", "user", "content", prompt)));
    }

    public Completion complete(String requestedProvider, List<Map<String, String>> messages) {
        return switch (provider(requestedProvider)) {
            case "ollama" -> ollama(messages);
            case "deepseek" -> deepSeek(messages);
            default -> throw new IllegalArgumentException("模型提供方仅支持 ollama 或 deepseek");
        };
    }

    /**
     * 要求模型输出 JSON。DeepSeek 走原生 JSON 模式；Ollama 通过提示词约束，
     * 由调用方负责解析，避免为同一问题重复请求。
     */
    public Completion completeJson(String requestedProvider, String system, String prompt) {
        if ("ollama".equals(provider(requestedProvider))) {
            return ollama(List.of(
                    Map.of("role", "system", "content", system),
                    Map.of("role", "user", "content", prompt + "\n\n只输出一个 JSON 对象，不要任何解释或 Markdown 代码块。")));
        }
        if (isBlank(deepSeekKey)) throw new IllegalStateException("未设置 DEEPSEEK_API_KEY");
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content", system),
                Map.of("role", "user", "content", prompt));
        try {
            JsonNode response = client(deepSeekUrl).post().uri("/chat/completions")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + deepSeekKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("model", deepSeekModel, "temperature", 0.1,
                            "response_format", Map.of("type", "json_object"), "messages", messages))
                    .retrieve().body(JsonNode.class);
            return new Completion("deepseek", deepSeekModel, firstMessage(response, "DeepSeek 未返回分析结果"));
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            if (status != 400 && status != 422) throw e;
            return deepSeek(messages);
        }
    }

    private Completion ollama(List<Map<String, String>> messages) {
        JsonNode response = client(ollamaUrl).post().uri("/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("model", ollamaModel, "stream", false, "messages", messages))
                .retrieve().body(JsonNode.class);
        return new Completion("ollama", ollamaModel,
                firstContent(response == null ? null : response.path("message").path("content").asText(null), "Ollama 未返回文本内容"));
    }

    private Completion deepSeek(List<Map<String, String>> messages) {
        if (isBlank(deepSeekKey)) throw new IllegalStateException("未设置 DEEPSEEK_API_KEY");
        JsonNode response = client(deepSeekUrl).post().uri("/chat/completions")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + deepSeekKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("model", deepSeekModel, "messages", messages))
                .retrieve().body(JsonNode.class);
        return new Completion("deepseek", deepSeekModel, firstMessage(response, "DeepSeek 未返回文本内容"));
    }

    private String firstMessage(JsonNode response, String emptyMessage) {
        String content = response == null ? null
                : response.path("choices").path(0).path("message").path("content").asText(null);
        return firstContent(content, emptyMessage);
    }

    private String firstContent(String content, String emptyMessage) {
        if (content == null || content.isBlank()) throw new IllegalStateException(emptyMessage);
        return content;
    }

    private String provider(String requested) {
        String value = requested == null || requested.isBlank() ? defaultProvider : requested.trim().toLowerCase();
        return value == null ? "ollama" : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private RestClient client(String baseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(120_000);
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
    }
}
