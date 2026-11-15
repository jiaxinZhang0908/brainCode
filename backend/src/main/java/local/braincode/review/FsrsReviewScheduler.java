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
    public record ForecastItem(Instant dueAt, double stability, double retention, long intervalDays) {}

    public NewCard createCard() {
        return createCard(null);
    }

    public NewCard createCard(Instant firstReviewAt) {
        Card card = firstReviewAt == null ? Card.builder().build() : Card.builder().due(firstReviewAt).build();
        return new NewCard(card.toJson(), card.getDue());
    }

    public java.util.List<ForecastItem> forecast(String stateJson, int count) {
        Card card = Card.fromJson(stateJson);
        Instant reviewAt = card.getDue().isAfter(Instant.now()) ? card.getDue() : Instant.now();
        java.util.List<ForecastItem> items = new java.util.ArrayList<>();
        for (int i = 0; i < count; i++) {
            CardAndReviewLog result = scheduler.reviewCard(card, Rating.GOOD, reviewAt);
            card = result.card();
            Instant due = card.getDue();
            double stability = card.getStability() == null ? 0 : card.getStability();
            double retention = scheduler.getCardRetrievability(card, due);
            long interval = Math.max(0, java.time.Duration.between(reviewAt, due).toDays());
            items.add(new ForecastItem(due, stability, retention, interval));
            reviewAt = due;
        }
        return items;
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
