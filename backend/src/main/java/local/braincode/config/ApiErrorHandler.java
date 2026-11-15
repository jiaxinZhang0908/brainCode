package local.braincode.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class ApiErrorHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", safeMessage(e)));
    }

    /** 未预期的异常只在服务端留痕，对外返回固定文案，避免泄露 SQL、路径等内部信息。 */
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> failure(Exception e) {
        log.error("请求处理失败", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "服务处理失败，请稍后重试"));
    }

    private String safeMessage(Exception e) {
        return e.getMessage() == null || e.getMessage().isBlank() ? "请求处理失败" : e.getMessage();
    }
}
