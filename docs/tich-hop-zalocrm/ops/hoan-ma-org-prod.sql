-- ============================================================================
--  HOAN MA ORG PROD - chot 23/09/2026.
--
--  VI SAO: ba nick trong org `prod-cs1` la nick THAT cua CO SO 2
--  (0702324055 Co Lien - 0702193933 Co Van; chu du an xac nhan 23/09).
--  Toan bo hoi thoai + contact dang bi xep duoi ten CS1.
--
--  CACH VA - DOI MA, KHONG DI TRU DU LIEU:
--    88 bang mang `org_id`. Doi `org_id` cua chung la mot dot di tru tren du lieu
--    khach hang that. Doi `organizations.code` la doi DUNG HAI DONG, va no dung vi
--    ma org chi duoc dung o MOT cho: `sata-sso-service.ts:183`
--    `organization.findUnique({ where: { code } })`. Duong API/webhook di bang
--    `x-api-key` -> `app_settings.public_api_key` -> `org_id`, khong qua ma.
--
--    org GIU DU LIEU  (e4b4b2ff...)  prod-cs1 -> prod-cs2
--    org RONG vua tao (832e5fd8...)  prod-cs2 -> prod-cs1
--
--  `organizations_code_key` la UNIQUE INDEX (khong deferrable) => phai di qua ma
--  tam, khong doi thang duoc.
--
--  KHOA KHONG DOI CHO: `public_api_key` / `webhook_secret` la dong trong
--  `app_settings` khoa theo `org_id`, nen chung o LAI voi du lieu. Dung nhu mong
--  muon - khoa dang duoc nick that dung se duoc khai duoi ten `prod-cs2`.
--
--  `webhook_url` CO mang ma trong chuoi => phai sua theo.
--
--  ============================================================================
--  REPEATABLE READ - KHONG PHAI CHO DEP. Fork dang NHAN TIN THAT ngay luc chay:
--  lan dry-run dau, so hoi thoai nhay 200 -> 201 GIUA hai phep dem, va cong chot
--  theo so tuyet doi da bao dong gia. Duoi REPEATABLE READ, ca hai anh chup nhin
--  cung mot snapshot, nen moi khac biet giua chung CHI co the do chinh cac lenh
--  trong tep nay gay ra. Do la dieu can chung minh: KHONG dong nao doi org.
--  ============================================================================

BEGIN ISOLATION LEVEL REPEATABLE READ;

-- --- 0. Chot danh tinh hai org TRUOC khi dong gi -----------------------------
DO $$
DECLARE n_a int; n_b int; ma_a text; ma_b text;
BEGIN
  SELECT code INTO ma_a FROM organizations WHERE id = 'e4b4b2ff-e779-4576-be02-df6eef8b0da5';
  SELECT code INTO ma_b FROM organizations WHERE id = '832e5fd8-818e-4d9d-aa83-800a6b609bfc';
  IF ma_a IS DISTINCT FROM 'prod-cs1' THEN
    RAISE EXCEPTION 'Org giu du lieu phai dang mang ma prod-cs1, dang mang %', coalesce(ma_a,'(khong ton tai)');
  END IF;
  IF ma_b IS DISTINCT FROM 'prod-cs2' THEN
    RAISE EXCEPTION 'Org rong phai dang mang ma prod-cs2, dang mang %', coalesce(ma_b,'(khong ton tai)');
  END IF;

  SELECT count(*) INTO n_a FROM zalo_accounts WHERE org_id = 'e4b4b2ff-e779-4576-be02-df6eef8b0da5';
  SELECT count(*) INTO n_b FROM zalo_accounts WHERE org_id = '832e5fd8-818e-4d9d-aa83-800a6b609bfc';
  IF n_a <> 3 THEN RAISE EXCEPTION 'Org giu du lieu phai co 3 nick, dang co %', n_a; END IF;
  IF n_b <> 0 THEN RAISE EXCEPTION 'Org rong phai co 0 nick, dang co %', n_b; END IF;
END $$;

-- --- 0b. Anh chup TRUOC: so dong theo tung org, cho cac bang mang du lieu that
CREATE TEMP TABLE _truoc ON COMMIT DROP AS
  SELECT 'zalo_accounts'::text AS bang, org_id, count(*) AS so FROM zalo_accounts GROUP BY org_id
  UNION ALL
  SELECT 'conversations', org_id, count(*) FROM conversations GROUP BY org_id
  UNION ALL
  SELECT 'contacts',      org_id, count(*) FROM contacts      GROUP BY org_id
  UNION ALL
  SELECT 'users',         org_id, count(*) FROM users         GROUP BY org_id;

-- --- 1. Hoan ma + hoan TEN (ten la thu hien tren khung nhung) ----------------
UPDATE organizations SET code = 'tam-hoan-doi', updated_at = now()
 WHERE id = 'e4b4b2ff-e779-4576-be02-df6eef8b0da5';

UPDATE organizations SET code = 'prod-cs1', name = 'Sata Robo - PROD (CS1)', updated_at = now()
 WHERE id = '832e5fd8-818e-4d9d-aa83-800a6b609bfc';

UPDATE organizations SET code = 'prod-cs2', name = 'Sata Robo - PROD (CS2)', updated_at = now()
 WHERE id = 'e4b4b2ff-e779-4576-be02-df6eef8b0da5';

-- --- 2. webhook_url phai mang ma MOI cua chinh org do -----------------------
UPDATE app_settings s
   SET value_plain = 'https://admin.satarobo.vn/api/webhooks/zalocrm/' || o.code,
       updated_at  = now()
  FROM organizations o
 WHERE o.id = s.org_id
   AND s.setting_key = 'webhook_url'
   AND o.code IN ('prod-cs1','prod-cs2');

-- --- 3. Nick THU: da luu kho tu 16/09, cau lenh nay la IDEMPOTENT ------------
-- Do 23/09: `archived_at = 2026-09-16 09:22:43` => `UPDATE 0` la DUNG, khong phai
-- loi. Giu lai cau lenh de tep tu du khi chay tren mot ban sao chua luu kho.
-- Khong xoa: 1 hoi thoai la dau vet kiem toan, va `chat-routes.ts:135` van cho
-- doc hoi thoai cua nick da luu kho (chi-doc). `app.ts:531` loc `archivedAt: null`
-- nen no thoi bi noi lai moi lan khoi dong.
-- Khop theo SO DIEN THOAI, khong theo ten: ten co dau => phu thuoc bang ma cua
-- duong chay psql. Cong 4.7 dem dung 1 dong nen khop nham la ROLLBACK.
UPDATE zalo_accounts SET archived_at = now()
 WHERE phone = '0328545229' AND archived_at IS NULL;

-- --- 4. Cong tu kiem TRONG cung giao dich ------------------------------------
CREATE TEMP TABLE _sau ON COMMIT DROP AS
  SELECT 'zalo_accounts'::text AS bang, org_id, count(*) AS so FROM zalo_accounts GROUP BY org_id
  UNION ALL
  SELECT 'conversations', org_id, count(*) FROM conversations GROUP BY org_id
  UNION ALL
  SELECT 'contacts',      org_id, count(*) FROM contacts      GROUP BY org_id
  UNION ALL
  SELECT 'users',         org_id, count(*) FROM users         GROUP BY org_id;

DO $$
DECLARE
  n int; ma text; ten text; url text; so_khoa int; so_luu_kho int; lech text;
BEGIN
  -- 4.1 Van du 5 org, 5 ma KHAC NHAU, va dung 5 ma mong doi.
  SELECT count(*) INTO n FROM organizations;
  IF n <> 5 THEN RAISE EXCEPTION 'Phai con dung 5 org, dang co %', n; END IF;
  SELECT count(DISTINCT code) INTO n FROM organizations;
  IF n <> 5 THEN RAISE EXCEPTION '5 org phai mang 5 ma KHAC NHAU, dang co % ma', n; END IF;
  SELECT count(*) INTO n FROM organizations
   WHERE code IN ('prod-cs1','prod-cs2','test-cs1','test-cs2','local-cs1');
  IF n <> 5 THEN RAISE EXCEPTION 'Con ma la ngoai bo 5 ma da chot (ma tam con sot?)'; END IF;

  -- 4.2 Du lieu THAT phai dang mang ma prod-cs2 va ten CS2.
  SELECT code, name INTO ma, ten FROM organizations WHERE id = 'e4b4b2ff-e779-4576-be02-df6eef8b0da5';
  IF ma <> 'prod-cs2' THEN RAISE EXCEPTION 'Org giu du lieu phai la prod-cs2, dang la %', ma; END IF;
  IF ten <> 'Sata Robo - PROD (CS2)' THEN RAISE EXCEPTION 'Ten org giu du lieu sai: %', ten; END IF;

  SELECT code, name INTO ma, ten FROM organizations WHERE id = '832e5fd8-818e-4d9d-aa83-800a6b609bfc';
  IF ma <> 'prod-cs1' THEN RAISE EXCEPTION 'Org rong phai la prod-cs1, dang la %', ma; END IF;
  IF ten <> 'Sata Robo - PROD (CS1)' THEN RAISE EXCEPTION 'Ten org rong sai: %', ten; END IF;

  -- 4.3 VACH DO: khong mot dong nao duoc doi org. So dong theo tung org phai
  --     TRUNG KHIT giua hai anh chup. So SANH HAI CHIEU - mot chieu bo lot ca
  --     "them dong moi".
  SELECT string_agg(format('%s/%s: %s', bang, coalesce(org_id,'(null)'), so), ' | ')
    INTO lech
    FROM ( (SELECT * FROM _truoc EXCEPT ALL SELECT * FROM _sau)
           UNION ALL
           (SELECT * FROM _sau   EXCEPT ALL SELECT * FROM _truoc) ) t;
  IF lech IS NOT NULL THEN
    RAISE EXCEPTION 'Co dong doi org (hoac them/bot): %', lech;
  END IF;

  -- 4.4 Khoa van rieng tung org, khong dong nao bi dung chung.
  SELECT count(DISTINCT value_plain) INTO so_khoa FROM app_settings WHERE setting_key = 'public_api_key';
  IF so_khoa <> 5 THEN RAISE EXCEPTION 'Phai co 5 public_api_key KHAC NHAU, dang co %', so_khoa; END IF;

  -- 4.5 MOI webhook_url phai ket thuc bang CHINH ma cua org no.
  FOR ma, url IN
    SELECT o.code, s.value_plain FROM app_settings s JOIN organizations o ON o.id = s.org_id
     WHERE s.setting_key = 'webhook_url'
  LOOP
    IF url NOT LIKE '%/' || ma THEN
      RAISE EXCEPTION 'webhook_url cua org % khong tro ve chinh no: %', ma, url;
    END IF;
  END LOOP;

  -- 4.6 Dung MOT nick duoc luu kho, va hai nick THAT van song.
  SELECT count(*) INTO so_luu_kho FROM zalo_accounts WHERE archived_at IS NOT NULL;
  IF so_luu_kho <> 1 THEN RAISE EXCEPTION 'Phai co dung 1 nick luu kho, dang co %', so_luu_kho; END IF;
  SELECT count(*) INTO n FROM zalo_accounts
   WHERE archived_at IS NULL AND phone IN ('0702324055','0702193933');
  IF n <> 2 THEN RAISE EXCEPTION 'Hai nick that phai con song va chua luu kho, dang co %', n; END IF;

  RAISE NOTICE 'Cong tu kiem: DAT - du lieu that nay mang ma prod-cs2, org rong mang prod-cs1, 0 dong doi org, 1 nick luu kho';
END $$;

COMMIT;
