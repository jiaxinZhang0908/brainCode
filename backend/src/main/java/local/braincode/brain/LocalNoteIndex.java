package local.braincode.brain;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.cjk.CJKAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.Term;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.FSDirectory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 本地全文索引。长期持有一个 IndexWriter，并用近实时 Reader 提供检索，
 * 避免每次增删都重新打开索引文件带来的 IO 开销。
 */
@Component
public class LocalNoteIndex {
    private final Path indexPath;
    private Analyzer analyzer;
    private FSDirectory directory;
    private IndexWriter writer;

    public LocalNoteIndex(@Value("${braincode.lucene-dir}") String indexPath) {
        this.indexPath = Path.of(indexPath).toAbsolutePath().normalize();
    }

    @PostConstruct
    void open() throws Exception {
        Files.createDirectories(indexPath);
        analyzer = new CJKAnalyzer();
        directory = FSDirectory.open(indexPath);
        IndexWriterConfig config = new IndexWriterConfig(analyzer);
        config.setOpenMode(IndexWriterConfig.OpenMode.CREATE_OR_APPEND);
        writer = new IndexWriter(directory, config);
        writer.commit();
    }

    public synchronized void put(String id, String title, String body) {
        try {
            Document doc = new Document();
            doc.add(new StringField("id", id, Field.Store.YES));
            doc.add(new TextField("title", title, Field.Store.YES));
            doc.add(new TextField("content", title + "\n" + body, Field.Store.NO));
            writer.updateDocument(new Term("id", id), doc);
        } catch (Exception e) {
            throw new IllegalStateException("无法更新本地全文索引", e);
        }
    }

    public synchronized void delete(String id) {
        try {
            writer.deleteDocuments(new Term("id", id));
        } catch (Exception e) {
            throw new IllegalStateException("无法从本地全文索引删除笔记", e);
        }
    }

    public synchronized void clear() {
        try {
            writer.deleteAll();
            writer.commit();
        } catch (Exception e) {
            throw new IllegalStateException("无法重建本地全文索引", e);
        }
    }

    public synchronized List<String> search(String query, int limit) {
        if (query == null || query.isBlank()) return List.of();
        String safeQuery = Arrays.stream(query.trim().split("\\s+"))
                .filter(token -> !token.isBlank())
                .map(QueryParser::escape)
                .collect(Collectors.joining(" "));
        if (safeQuery.isBlank()) return List.of();
        try (DirectoryReader reader = DirectoryReader.open(writer)) {
            IndexSearcher searcher = new IndexSearcher(reader);
            TopDocs hits = searcher.search(new QueryParser("content", analyzer).parse(safeQuery),
                    Math.max(1, Math.min(limit, 100)));
            List<String> ids = new ArrayList<>();
            for (var hit : hits.scoreDocs) ids.add(searcher.storedFields().document(hit.doc).get("id"));
            return ids;
        } catch (Exception e) {
            throw new IllegalStateException("本地全文检索失败", e);
        }
    }

    @PreDestroy
    void close() throws Exception {
        if (writer != null) writer.close();
        if (directory != null) directory.close();
        if (analyzer != null) analyzer.close();
    }
}
