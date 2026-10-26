package com.example.apiplatform;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1")
public class ChatController {
    record ChatRequest(String message) {}

    private static final int COST = 1;

    private final BillingService billing;
    private final RestClient client = RestClient.create();

    @Value("${anthropic.api-key}")
    private String apiKey;

    @Value("${anthropic.model}")
    private String model;

    public ChatController(BillingService billing) {
        this.billing = billing;
    }

    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody ChatRequest body, HttpServletRequest req) {
        if (apiKey.isBlank()) {
            return ResponseEntity.status(501).body(Map.of("error", "text AI is not enabled on this server"));
        }
        String email = (String) req.getAttribute("email");
        if (body.message() == null || body.message().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "message is required"));
        }
        if (!billing.charge(email, COST)) {
            return ResponseEntity.status(402).body(Map.of("error", "no credits left"));
        }
        try {
            JsonNode res = client.post()
                    .uri("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", "2023-06-01")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "model", model,
                            "max_tokens", 1000,
                            "messages", List.of(Map.of("role", "user", "content", body.message()))))
                    .retrieve()
                    .body(JsonNode.class);
            String text = res.path("content").path(0).path("text").asText();
            return ResponseEntity.ok(Map.of("reply", text));
        } catch (Exception e) {
            billing.refund(email, COST);
            return ResponseEntity.status(502).body(Map.of("error", "upstream failure"));
        }
    }
                                  }
