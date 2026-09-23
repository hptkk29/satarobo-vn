-- ============================================================================
--  TAT 7 TAI KHOAN UAT/TEST trong org giu du lieu khach hang THAT (prod-cs2).
--  Chu du an chot 23/09/2026: "tat ca 7".
--
--  VI SAO: org `prod-cs2` giu 201 hoi thoai + 629 contact THAT. Trong do co 7 tai
--  khoan la tan du tu truoc luc tach org (hoi do moi moi truong do chung MOT org):
--  3 sinh tu ve TEST, 2 tu ve MAY DEV, 2 la fixture `.test.local`. CA 7 deu CO mat
--  khau va `is_active = true`, va HAI trong so do mang vai `admin`.
--
--  KHONG XOA — chi ha `is_active`. Fork kiem `isActive` ngay o duong dang nhap
--  (`backend/src/modules/auth/auth-service.ts:39` va `:142`) nen ha co la dong duoc,
--  va lui lai cung mot cau. Xoa thi mat dau vet ai da tung duoc tao o day.
--
--  MOC CHON: `last_login_at IS NULL` — ca 7 CHUA BAO GIO dang nhap, con tai khoan
--  that duy nhat (chu so huu) thi da dang nhap 17/09. Dung moc nay thay vi liet ke
--  email: liet ke tay la go nham mot chuoi thi tat nham nguoi.
-- ============================================================================

BEGIN ISOLATION LEVEL REPEATABLE READ;

-- --- 0. Chot hien trang TRUOC ----------------------------------------------
DO $$
DECLARE tong int; da_dn int; dang_bat int;
BEGIN
  SELECT count(*) INTO tong FROM users u JOIN organizations o ON o.id=u.org_id
   WHERE o.code='prod-cs2';
  IF tong <> 8 THEN RAISE EXCEPTION 'Doi 8 tai khoan trong prod-cs2, dang co %', tong; END IF;

  SELECT count(*) INTO da_dn FROM users u JOIN organizations o ON o.id=u.org_id
   WHERE o.code='prod-cs2' AND u.last_login_at IS NOT NULL;
  IF da_dn <> 1 THEN RAISE EXCEPTION 'Doi DUNG 1 tai khoan da tung dang nhap, dang co %', da_dn; END IF;

  SELECT count(*) INTO dang_bat FROM users u JOIN organizations o ON o.id=u.org_id
   WHERE o.code='prod-cs2' AND u.is_active;
  IF dang_bat <> 8 THEN RAISE EXCEPTION 'Doi ca 8 dang bat, dang co %', dang_bat; END IF;
END $$;

-- Anh chup de so o cuoi + de LUI dung 7 dong nay.
CREATE TEMP TABLE _truoc ON COMMIT DROP AS
  SELECT u.id, u.is_active, u.org_id FROM users u;

-- --- 1. Ha co ---------------------------------------------------------------
UPDATE users u
   SET is_active = false, updated_at = now()
  FROM organizations o
 WHERE o.id = u.org_id
   AND o.code = 'prod-cs2'
   AND u.last_login_at IS NULL
   AND u.is_active;

-- --- 2. Cong tu kiem TRONG cung giao dich -----------------------------------
DO $$
DECLARE n int; ai text; lech int;
BEGIN
  -- 2.1 Con DUNG 1 tai khoan bat trong prod-cs2, va no la chu so huu DA dang nhap.
  SELECT count(*) INTO n FROM users u JOIN organizations o ON o.id=u.org_id
   WHERE o.code='prod-cs2' AND u.is_active;
  IF n <> 1 THEN RAISE EXCEPTION 'Phai con DUNG 1 tai khoan bat, dang con %', n; END IF;

  SELECT coalesce(u.email,'(rong)') INTO ai FROM users u JOIN organizations o ON o.id=u.org_id
   WHERE o.code='prod-cs2' AND u.is_active;
  IF ai <> 'hoangphantuankiet.sr@satarobo.vn' THEN
    RAISE EXCEPTION 'Tai khoan con bat phai la chu so huu, dang la %', ai;
  END IF;

  -- 2.2 DUNG 7 dong doi trang thai, khong hon khong kem.
  SELECT count(*) INTO n FROM _truoc t JOIN users u ON u.id=t.id
   WHERE u.is_active IS DISTINCT FROM t.is_active;
  IF n <> 7 THEN RAISE EXCEPTION 'Phai doi DUNG 7 dong, dang doi %', n; END IF;

  -- 2.3 VACH DO: khong dong nao ngoai prod-cs2 bi dung toi.
  SELECT count(*) INTO lech FROM _truoc t JOIN users u ON u.id=t.id
    JOIN organizations o ON o.id=t.org_id
   WHERE u.is_active IS DISTINCT FROM t.is_active AND o.code <> 'prod-cs2';
  IF lech <> 0 THEN RAISE EXCEPTION 'Co % dong NGOAI prod-cs2 bi doi trang thai', lech; END IF;

  -- 2.4 Khong ai bi xoa.
  SELECT count(*) INTO n FROM users;
  IF n <> (SELECT count(*) FROM _truoc) THEN RAISE EXCEPTION 'So tai khoan thay doi — co dong bi xoa'; END IF;

  RAISE NOTICE 'Cong tu kiem: DAT - 7 tai khoan UAT/test da tat, chu so huu van bat, 0 dong ngoai prod-cs2 bi dung';
END $$;

COMMIT;
