package com.example.apiplatform;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

@Service
public class ApiKeyService {
    private final DataStore store;
    private final SecureRandom random = new SecureRandom();

    public ApiKeyService(DataStore store) {
        this.store = store;
    }

    public Optional<String> createKey(String email) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String key = "sk_live_" + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return store.addKeyHash(email, sha256(key)) ? Optional.of(key) : Optional.empty();
    }

    public Optional<String> verify(String key) {
        return Optional.ofNullable(store.emailByKeyHash(sha256(key)));
    }

    private String sha256(String s) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
          }
