CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learn_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  context_id VARCHAR(255) NOT NULL,
  err_count INT NOT NULL DEFAULT 0,
  time_record INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Demo account: email=demo@example.com, password=demo1234
INSERT IGNORE INTO users (email, password) VALUES
  ('demo@example.com', '$2a$10$Lsa6IwzHf3c7QEWFAmJDu.ZHOZC9pm.iJl3O07eSYOk1Q577lzCMC');

-- Demo learn_status: all modules with varied progress data
INSERT IGNORE INTO learn_status (user_id, context_id, err_count, time_record) VALUES
  (1, '2',  1, 120),
  (1, '4',  3, 240),
  (1, '6',  1,  90),
  (1, '71', 5, 310),
  (1, '72', 2, 180),
  (1, '73', 4, 270),
  (1, '74', 1, 150),
  (1, '75', 1, 200);
