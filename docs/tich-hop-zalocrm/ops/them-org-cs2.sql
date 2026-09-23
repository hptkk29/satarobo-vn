-- ============================================================================
--  Them org cho CO SO 2 — chot 23/09/2026: HAI ORG, khong dung chung.
--
--  VI SAO HAI ORG (khong phai mot org phan quyen theo nick):
--    · mot nick Zalo chi co MOT phien song => no chi thuoc ve MOT org;
--    · tuong org la tuong THAT — da do: doc hoi thoai org khac -> 404,
--      ghi quyen len nick org khac -> 404 (10-no17... muc 4);
--    · phan quyen theo nick la mot DUONG MA, ma `capQuyenNickZalocrm` THAY CA TAP
--      quyen moi luot — sai mot lan la CS2 thay nick CS1.
--
--  Ten dat theo khuon da chot 21/09 (moi truong + co so) nen day chi la TAO THEM,
--  khong phai doi ten cai dang co.
--
--  TAO CA `test-cs2`: duong CS2 phai nghiem thu duoc tren `test` TRUOC khi len prod
--  — do la ky luat cua repo, khong phai cho dep doi hinh.
--  KHONG tao `local-cs2`: may dev chi mot nguoi dung, chua co nhu cau; them sau
--  bang dung kich ban nay, doi `test-` thanh `local-`.
-- ============================================================================

BEGIN;

-- --- 1. Hai org moi ---------------------------------------------------------
INSERT INTO organizations (id, name, code, updated_at)
VALUES (gen_random_uuid()::text, 'Sata Robo - PROD (CS2)', 'prod-cs2', now());

INSERT INTO organizations (id, name, code, updated_at)
VALUES (gen_random_uuid()::text, 'Sata Robo - TEST (CS2)', 'test-cs2', now());

-- --- 2. Khoa RIENG tung org -------------------------------------------------
-- Bi mat sinh NGAY TRONG DB (gen_random_uuid x2 = 64 ky tu hex) nen khong bao gio
-- di qua dong lenh, chat hay log.
INSERT INTO app_settings (id, org_id, setting_key, value_plain, updated_at)
SELECT gen_random_uuid()::text, o.id, 'public_api_key',
       replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
       now()
  FROM organizations o WHERE o.code IN ('prod-cs2','test-cs2');

INSERT INTO app_settings (id, org_id, setting_key, value_plain, updated_at)
SELECT gen_random_uuid()::text, o.id, 'webhook_secret',
       replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
       now()
  FROM organizations o WHERE o.code IN ('prod-cs2','test-cs2');

-- --- 3. Webhook dung moi truong --------------------------------------------
INSERT INTO app_settings (id, org_id, setting_key, value_plain, updated_at)
SELECT gen_random_uuid()::text, o.id, 'webhook_url',
       'https://admin.satarobo.vn/api/webhooks/zalocrm/prod-cs2', now()
  FROM organizations o WHERE o.code = 'prod-cs2';

INSERT INTO app_settings (id, org_id, setting_key, value_plain, updated_at)
SELECT gen_random_uuid()::text, o.id, 'webhook_url',
       'https://test.satarobo.vn/api/webhooks/zalocrm/test-cs2', now()
  FROM organizations o WHERE o.code = 'test-cs2';

-- --- 4. Cong tu kiem TRONG cung giao dich -----------------------------------
DO $$
DECLARE so_org int; so_key int; so_nick_la int; so_set int;
BEGIN
  SELECT count(*) INTO so_org FROM organizations
   WHERE code IN ('prod-cs1','test-cs1','local-cs1','prod-cs2','test-cs2');
  IF so_org <> 5 THEN RAISE EXCEPTION 'Phai co dung 5 org, dang co %', so_org; END IF;

  -- MOI org mot khoa RIENG, va tat ca phai KHAC NHAU.
  SELECT count(DISTINCT value_plain) INTO so_key
    FROM app_settings WHERE setting_key = 'public_api_key';
  IF so_key <> 5 THEN RAISE EXCEPTION 'Phai co 5 public_api_key KHAC NHAU, dang co %', so_key; END IF;

  -- Hai org moi phai co du 3 setting.
  SELECT count(*) INTO so_set FROM app_settings s
    JOIN organizations o ON o.id = s.org_id WHERE o.code IN ('prod-cs2','test-cs2');
  IF so_set <> 6 THEN RAISE EXCEPTION 'Hai org moi phai co 6 setting (3 moi org), dang co %', so_set; END IF;

  -- Nick THAT phai o LAI prod-cs1 — khong duoc dich di dau ca.
  SELECT count(*) INTO so_nick_la FROM zalo_accounts z
    JOIN organizations o ON o.id = z.org_id WHERE o.code <> 'prod-cs1';
  IF so_nick_la <> 0 THEN RAISE EXCEPTION 'Nick phai o lai prod-cs1; dang co % nick o org khac', so_nick_la; END IF;

  RAISE NOTICE 'Cong tu kiem: DAT (5 org, 5 khoa khac nhau, 6 setting moi, nick van o prod-cs1)';
END $$;

COMMIT;
