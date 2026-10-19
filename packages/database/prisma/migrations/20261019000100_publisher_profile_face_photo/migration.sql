ALTER TABLE publisher_profile
  ADD COLUMN face_photo text NOT NULL DEFAULT '',
  ADD CONSTRAINT publisher_profile_face_photo_size
    CHECK (octet_length(face_photo) <= 27962051);
