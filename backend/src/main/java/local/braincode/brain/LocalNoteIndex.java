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
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.FSDirectory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Component
public class LocalNoteIndex {
    private final Path indexPath;
    private Analyzer analyzer;
    private FSDirectory directory;

    public LocalNoteIndex(@Value("${braincode.lucene-dir}") String indexPath) {
        this.indexPath = Path.of(indexPath).toAbsolutePath().normalize();
    }

    @PostConstruct
    void open() throws Exception {
        Files.createDirectories(indexPath);
        analyzer = new CJKAnalyzer();
        directory = FSDirectory.open(indexPath);
    }

    public synchronized void put(String id, String title, String body) {
        try (IndexWriter writer = writer()) {
            Document doc = new Document();
            doc.add(new StringField("id", id, Field.Store.YES));
            doc.add(new TextField("title", title, Field.Store.YES));
            doc.add(new TextField("content", title + "\n" + body, Field.Store.NO));
            writer.updateDocument(new org.apache.lucene.index.Term("id", id), doc);
        } catch (Exception e) {
            throw new IllegalStateException("无法更新本地全文索引", e);
        }
    }

    public synchronized void delete(String id) {
        try (IndexWriter writer = writer()) {
            writer.deleteDocuments(new org.apache.lucene.index.Term("id", id));
        } catch (Exception e) {
            throw new IllegalStateException("无法从本地全文索引删除笔记", e);
        }
    }

    public synchronized void clear() {
        try (IndexWriter writer = writer()) { writer.deleteAll(); }
        catch (Exception e) { throw new IllegalStateException("无法重建本地全文索引", e); }
    }

    public synchronized List<String> search(String query, int limit) {
        if (query == null || query.isBlank()) return List.of();
        try {
            if (!DirectoryReader.indexExists(directory)) return List.of();
            try (DirectoryReader reader = DirectoryReader.open(directory)) {
            var parser = new QueryParser("content", analyzer);
            String safeQuery = java.util.Arrays.stream(query.trim().split("\\s+"))
                    .map(QueryParser::escape).collect(java.util.stream.Collectors.joining(" "));
            var parsed = parser.parse(safeQuery);
            IndexSearcher searcher = new IndexSearcher(reader);
            TopDocs hits = searcher.search(parsed, Math.max(1, Math.min(limit, 100)));
            List<String> ids = new ArrayList<>();
            for (var hit : hits.scoreDocs) ids.add(searcher.doc(hit.doc).get("id"));
            return ids;
            }
        } catch (Exception e) {
            throw new IllegalStateException("本地全文检索失败", e);
        }
    }

    @PreDestroy
    void close() throws Exception {
        if (directory != null) directory.close();
        if (analyzer != null) analyzer.close();
    }

    private IndexWriter writer() throws Exception {
        return new IndexWriter(directory, new IndexWriterConfig(analyzer));
    }
}
