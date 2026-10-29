package local.braincode.review;

import io.github.openspacedrepetition.Card;
import io.github.openspacedrepetition.CardAndReviewLog;
import io.github.openspacedrepetition.Rating;
import io.github.openspacedrepetition.Scheduler;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Keeps the library's UTC instants behind an app-local scheduling boundary. */
@Service
public class FsrsReviewScheduler {
    private static final ZoneId USER_ZONE = ZoneId.of("Asia/Shanghai");
    private final Scheduler scheduler = Scheduler.builder().build();

    public record NewCard(String stateJson, Instant dueAt) {}
    public record ReviewResult(String stateJson, Instant dueAt, String rating, LocalDate dueLocalDate) {}

    public NewCard createCard() {
        Card card = Card.builder().build();
        return new NewCard(card.toJson(), card.getDue());
    }

    public ReviewResult answer(String stateJson, String ratingName) {
        Rating rating;
        try { rating = Rating.valueOf(ratingName.trim().toUpperCase()); }
        catch (Exception e) { throw new IllegalArgumentException("评分请使用 AGAIN、HARD、GOOD 或 EASY"); }
        Card card = Card.fromJson(stateJson);
        CardAndReviewLog result = scheduler.reviewCard(card, rating);
        Card updated = result.card();
        Instant due = updated.getDue();
        return new ReviewResult(updated.toJson(), due, rating.name(), due.atZone(USER_ZONE).toLocalDate());
    }
}
