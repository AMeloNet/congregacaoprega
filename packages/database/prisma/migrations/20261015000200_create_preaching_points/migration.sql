CREATE TABLE preaching_point (
  id UUID PRIMARY KEY,
  congregation_id UUID NOT NULL REFERENCES congregation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name TEXT NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  address TEXT NOT NULL DEFAULT '' CHECK (char_length(address) <= 250),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 250),
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  allowed_types equipment_type[] CHECK (
    allowed_types IS NOT NULL AND
    cardinality(allowed_types) BETWEEN 1 AND 3
    AND array_position(allowed_types, NULL) IS NULL
    AND array_ndims(allowed_types) = 1
    AND array_length(array_positions(allowed_types, 'CART'), 1) IS NOT DISTINCT FROM CASE WHEN 'CART' = ANY(allowed_types) THEN 1 ELSE NULL END
    AND array_length(array_positions(allowed_types, 'KIOSK'), 1) IS NOT DISTINCT FROM CASE WHEN 'KIOSK' = ANY(allowed_types) THEN 1 ELSE NULL END
    AND array_length(array_positions(allowed_types, 'DISPLAY'), 1) IS NOT DISTINCT FROM CASE WHEN 'DISPLAY' = ANY(allowed_types) THEN 1 ELSE NULL END
  )
);
CREATE UNIQUE INDEX preaching_point_congregation_name_key ON preaching_point (congregation_id, lower(name));
