-- Chromatogram image for the partner COA payload (tests[].results[].chromatogram_image).
-- Populated as a data: URI (base64 PNG) sourced from a sibling
-- "<report>.chromatogram.png" file the lab-PC conversion agent writes next
-- to each xlsx report in the Drive folder (the report's own embedded
-- picture is a Windows EMF metafile, not directly usable by the partner).
-- Stored inline rather than as a Drive link since the partner endpoint is
-- public and the partner has no Drive credentials to fetch a link with.
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS chromatogram_image text;
