package com.example.apiplatform;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/auth")
public class AuthController {
    record Credentials(String email, String password) {}

    private final DataStore store;
    private final ApiKeyService keys;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthController(DataStore store, ApiKeyService keys) {
        this.store = store;
        this.keys = keys;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Credentials c) {
        if (c.email() == null || !c.email().contains("@") || c.password() == null || c.password().length() < 8) {
            return ResponseEntity.badRequest().body(Map.of("error", "valid email and password (8+ chars) required"));
        }
        int r = store.register(c.email().trim().toLowerCase(), encoder.encode(c.password()));
        if (r == 1) return ResponseEntity.status(409).body(Map.of("error", "email already registered"));
        if (r == 2) return ResponseEntity.status(403).body(Map.of("error", "registration is closed (user limit)"));
        return ResponseEntity.ok(Map.of("status", "registered"));
    }

    @PostMapping("/keys")
    public ResponseEntity<?> newKey(@RequestBody Credentials c) {
        if (c.email() == null || c.password() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "wrong email or password"));
        }
        String email = c.email().trim().toLowerCase();
        String hash = store.passwordHash(email);
        if (hash == null || !encoder.matches(c.password(), hash)) {
            return ResponseEntity.status(401).body(Map.of("error", "wrong email or password"));
        }
        Optional<String> key = keys.createKey(email);
        if (key.isEmpty()) {
            return ResponseEntity.status(409).body(Map.of("error", "key limit reached (5 per account)"));
        }
        return ResponseEntity.ok(Map.of("api_key", key.get()));
    }
          }
