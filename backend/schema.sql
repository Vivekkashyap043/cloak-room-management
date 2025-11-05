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
  token_number VARCHAR(100) NOT NULL,
  location VARCHAR(64) NOT NULL,
  person_photo_path VARCHAR(500) DEFAULT NULL,
  event_name VARCHAR(255) DEFAULT NULL,
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


CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  event_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE UNIQUE INDEX idx_token_location_event_unique ON records (token_number, location, event_name);
