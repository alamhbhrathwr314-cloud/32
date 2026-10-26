package com.example.apiplatform;

import java.util.ArrayList;
import java.util.List;

public class UserRec {
    public String email;
    public String passwordHash;
    public int credits = 100;
    public long requests;
    public List<String> keyHashes = new ArrayList<>();
}
