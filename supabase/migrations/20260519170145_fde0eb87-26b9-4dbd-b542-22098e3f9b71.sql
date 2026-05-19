
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count int;
  fn text;
  ln text;
  tt text;
  full_n text;
BEGIN
  fn := NULLIF(NEW.raw_user_meta_data->>'first_name', '');
  ln := NULLIF(NEW.raw_user_meta_data->>'last_name', '');
  tt := NULLIF(NEW.raw_user_meta_data->>'title', '');
  full_n := NULLIF(NEW.raw_user_meta_data->>'full_name', '');
  IF full_n IS NULL THEN
    full_n := NULLIF(trim(concat_ws(' ', fn, ln)), '');
  END IF;
  IF full_n IS NULL THEN
    full_n := NEW.email;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, title)
  VALUES (NEW.id, NEW.email, full_n, fn, ln, tt);

  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tech');
  END IF;
  RETURN NEW;
END;
$function$;
