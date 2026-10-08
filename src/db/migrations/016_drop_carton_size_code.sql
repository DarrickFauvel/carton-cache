-- Label codes are now "<source>-<LxWxH in>"; the size code is no longer used.
ALTER TABLE carton_types DROP COLUMN size_code;
