package com.example.apiplatform;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service
public class DataStore {
    private static final Logger log = LoggerFactory.getLogger(DataStore.class);
    private static final int MAX_KEYS_PER_USER = 5;

    private final ObjectMapper mapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private final RestClient http = RestClient.create();
    private final Object saveLock = new Object();

    private Database db = new Database();
    private final Map<String, String> keyIndex = new HashMap<>();
    private String sha;
    private boolean dirty;

    @Value("${github.token}")
    private String token;
    @Value("${github.repo}")
    private String repo;
    @Value("${github.branch}")
    private String branch;
    @Value("${github.path}")
    private String path;
    @Value("${app.max-users}")
    private int maxUsers;

    private boolean remote() {
        return !token.isBlank() && !repo.isBlank();
    }

    private String url() {
        return "https://api.github.com/repos/" + repo + "/contents/" + path;
    }

    @PostConstruct
    public void load() {
        if (!remote()) {
            log.warn("GitHub storage is not configured: data is kept in memory only");
            return;
        }
        try {
            JsonNode res = http.get()
                    .uri(url() + "?ref=" + branch)
                    .header("Authorization", "Bearer " + token)
                    .header("Accept", "application/vnd.github+json")
                    .retrieve()
                    .body(JsonNode.class);
            sha = res.path("sha").asText();
            byte[] raw = Base64.getMimeDecoder().decode(res.path("content").asText());
            db = mapper.readValue(raw, Database.class);
            for (UserRec u : db.users.values()) {
                for (String h : u.keyHashes) keyIndex.put(h, u.email);
            }
            log.info("Loaded {} users from GitHub", db.users.size());
        } catch (HttpClientErrorException.NotFound e) {
            log.info("No database file in the repo yet, starting empty");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load database from GitHub", e);
        }
    }

    public synchronized int register(String email, String passwordHash) {
        if (db.users.containsKey(email)) return 1;
        if (db.users.size() >= maxUsers) return 2;
        UserRec u = new UserRec();
        u.email = email;
        u.passwordHash = passwordHash;
        db.users.put(email, u);
        dirty = true;
        return 0;
    }

    public synchronized String passwordHash(String email) {
        UserRec u = db.users.get(email);
        return u == null ? null : u.passwordHash;
    }

    public synchronized boolean addKeyHash(String email, String keyHash) {
        UserRec u = db.users.get(email);
        if (u == null || u.keyHashes.size() >= MAX_KEYS_PER_USER) return false;
        u.keyHashes.add(keyHash);
        keyIndex.put(keyHash, email);
        dirty = true;
        return true;
    }

    public synchronized String emailByKeyHash(String keyHash) {
        return keyIndex.get(keyHash);
    }

    public synchronized int credits(String email) {
        UserRec u = db.users.get(email);
        return u == null ? 0 : u.credits;
    }

    public synchronized boolean deduct(String email, int cost) {
        UserRec u = db.users.get(email);
        if (u == null || u.credits < cost) return false;
        u.credits -= cost;
        u.requests++;
        dirty = true;
        return true;
    }

    public synchronized void refund(String email, int amount) {
        UserRec u = db.users.get(email);
        if (u == null) return;
        u.credits += amount;
        dirty = true;
    }

    @Scheduled(fixedDelay = 10000)
    public void flush() {
        saveIfDirty();
    }

    @PreDestroy
    public void onStop() {
        saveIfDirty();
    }

    private void saveIfDirty() {
        synchronized (saveLock) {
            String json;
            synchronized (this) {
                if (!dirty || !remote()) return;
                try {
                    json = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(db);
                } catch (Exception e) {
                    log.error("Could not serialize database", e);
                    return;
                }
                dirty = false;
            }
            try {
                Map<String, Object> body = new HashMap<>();
                body.put("message", "update database");
                body.put("content", Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8)));
                body.put("branch", branch);
                if (sha != null && !sha.isBlank()) body.put("sha", sha);
                JsonNode res = http.put()
                        .uri(url())
                        .header("Authorization", "Bearer " + token)
                        .header("Accept", "application/vnd.github+json")
                        .body(body)
                        .retrieve()
                        .body(JsonNode.class);
                sha = res.path("content").path("sha").asText();
            } catch (Exception e) {
                log.error("Saving to GitHub failed, will retry", e);
                synchronized (this) {
                    dirty = true;
                }
            }
        }
    }
  }
