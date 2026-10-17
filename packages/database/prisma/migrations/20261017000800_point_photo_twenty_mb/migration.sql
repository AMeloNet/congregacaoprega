ALTER TABLE preaching_point
  DROP CONSTRAINT preaching_point_photo_size,
  ADD CONSTRAINT preaching_point_photo_size
    CHECK (octet_length(photo) <= 27962051);
