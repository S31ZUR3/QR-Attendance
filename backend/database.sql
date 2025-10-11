CREATE TABLE members (
    register_no TEXT PRIMARY KEY,
    name TEXT,
    designation TEXT,
    department TEXT,
    year TEXT
);

CREATE TABLE attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    register_no TEXT,
    date TEXT,
    FOREIGN KEY (register_no) REFERENCES members(register_no)
);
