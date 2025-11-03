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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create records table
CREATE TABLE IF NOT EXISTS records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_number VARCHAR(100) NOT NULL UNIQUE,
  person_name VARCHAR(255) NOT NULL,
  person_photo_path VARCHAR(500) NOT NULL,
  things_name VARCHAR(255) NOT NULL,
  things_photo_path VARCHAR(500) NOT NULL,
  status ENUM('submitted', 'returned') DEFAULT 'submitted',
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  returned_at DATETIME NULL
);
