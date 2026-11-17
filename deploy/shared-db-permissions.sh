set_shared_db_permissions() {
  local db="$1"
  local group="$2"
  local suffix file

  for suffix in '' -wal -shm -journal; do
    file="$db$suffix"
    if [ -f "$file" ]; then
      chgrp "$group" "$file"
      chmod 660 "$file"
    fi
  done
}
