package com.example.apiplatform;

import org.springframework.stereotype.Service;

@Service
public class BillingService {
    private final DataStore store;

    public BillingService(DataStore store) {
        this.store = store;
    }

    public boolean charge(String email, int cost) {
        return store.deduct(email, cost);
    }

    public void refund(String email, int cost) {
        store.refund(email, cost);
    }
}
