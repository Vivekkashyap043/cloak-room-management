-- Create database
CREATE DATABASE IF NOT EXISTS cloakroomdb 
  DEFAULT CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

-- Use the database
USE cloakroomdb;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') DEFAULT 'user',
  -- location indicates which cloakroom the user operates (gents or ladies)
  location ENUM('gents location','ladies location') NOT NULL DEFAULT 'gents location',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create records table
CREATE TABLE IF NOT EXISTS records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_number VARCHAR(100) NOT NULL UNIQUE,
  -- location of the record (auto-filled from the authenticated user's location)
  location VARCHAR(64) NOT NULL,
  -- things_name removed: items are stored in separate `items` table
  person_photo_path VARCHAR(500) DEFAULT NULL,
  status ENUM('deposited', 'returned') DEFAULT 'deposited',
  deposited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  returned_at DATETIME NULL
);

-- Items table: each record can have multiple items (name and count). Each item may have an optional photo_path.
CREATE TABLE IF NOT EXISTS items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  record_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_count INT NOT NULL DEFAULT 1,
  item_photo_path VARCHAR(500) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
);
