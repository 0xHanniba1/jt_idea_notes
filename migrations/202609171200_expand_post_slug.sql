-- Transliteration can make a 100-character Unicode title longer than 100 ASCII characters.
ALTER TABLE posts ALTER COLUMN slug TYPE TEXT;
