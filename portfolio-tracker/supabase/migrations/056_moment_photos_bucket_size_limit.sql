-- Phone photos routinely exceed the previous 5MB limit; the frontend now compresses
-- images before upload, but raise the bucket cap as a safety net for edge cases.
update storage.buckets set file_size_limit = 15728640 where id = 'moment-photos';
