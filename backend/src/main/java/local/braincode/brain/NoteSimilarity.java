package local.braincode.brain;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 本地候选知识排序。用轻量的字面相似度先缩小候选范围，
 * 让 AI 只处理最相关的少量笔记，从而显著降低 token 消耗。
 */
final class NoteSimilarity {
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_.+-]{2,}|[\\u4e00-\\u9fff]{2,}");
    private static final String[] DIMENSION_CUES = {
            "定义", "原理", "机制", "原因", "导致", "前提", "条件", "组成",
            "包含", "步骤", "应用", "场景", "例子", "区别", "对比", "限制", "优势", "缺点"
    };

    private NoteSimilarity() {
    }

    static double score(NoteService.Note a, NoteService.Note b) {
        String left = a.title() + " " + a.body();
        String right = b.title() + " " + b.body();
        Set<String> leftTerms = terms(left);
        Set<String> rightTerms = terms(right);
        Set<String> shared = new HashSet<>(leftTerms);
        shared.retainAll(rightTerms);
        double bodyOverlap = shared.isEmpty() ? 0
                : (double) shared.size() / Math.max(1, Math.min(leftTerms.size(), rightTerms.size()));

        Set<String> titleLeft = terms(a.title());
        Set<String> titleRight = terms(b.title());
        Set<String> titleShared = new HashSet<>(titleLeft);
        titleShared.retainAll(titleRight);
        double titleOverlap = titleShared.isEmpty() ? 0
                : (double) titleShared.size() / Math.max(1, Math.min(titleLeft.size(), titleRight.size()));

        int cues = 0;
        for (String cue : DIMENSION_CUES) {
            if (left.contains(cue) && right.contains(cue)) cues++;
        }
        double relationCues = Math.min(1, cues / 3.0);

        return titleOverlap * .45 + bodyOverlap * .4 + relationCues * .15;
    }

    private static Set<String> terms(String text) {
        Set<String> result = new HashSet<>();
        Matcher matcher = TOKEN.matcher(text.toLowerCase(Locale.ROOT));
        while (matcher.find()) {
            String token = matcher.group();
            if (token.matches("[\\u4e00-\\u9fff]+")) {
                for (int i = 0; i < token.length() - 1; i++) result.add(token.substring(i, i + 2));
            } else {
                result.add(token);
            }
        }
        return result;
    }
}
