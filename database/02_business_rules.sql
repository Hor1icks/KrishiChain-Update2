-- =====================================================================
-- KrishiChain | 02_business_rules.sql
--
-- Cross-table business rules as callable PL/SQL. Rules that compare two
-- tables cannot be CHECK constraints, so the service layer calls these
-- before the statement they guard.
-- =====================================================================

CREATE OR REPLACE PACKAGE pkg_krishi_rules AS

  PROCEDURE check_bid_min_qty (p_batch_id IN NUMBER, p_requested_qty IN NUMBER);

  PROCEDURE check_payment_allowed (p_sale_order_id IN NUMBER, p_amount IN NUMBER);

  PROCEDURE check_one_personnel (p_transport_id IN NUMBER,
                                 p_personnel_id IN NUMBER,
                                 p_assignment_id IN NUMBER DEFAULT NULL);

  FUNCTION next_unit_no (p_warehouse_id IN NUMBER) RETURN NUMBER;

END pkg_krishi_rules;
/

CREATE OR REPLACE PACKAGE BODY pkg_krishi_rules AS

  PROCEDURE check_bid_min_qty (p_batch_id IN NUMBER, p_requested_qty IN NUMBER) IS
    v_min HARVEST_BATCH.MinimumBidQuantity%TYPE;
  BEGIN
    SELECT MinimumBidQuantity INTO v_min
      FROM HARVEST_BATCH WHERE BatchID = p_batch_id;

    IF p_requested_qty < v_min THEN
      RAISE_APPLICATION_ERROR(-20003,
        'Requested quantity ' || p_requested_qty ||
        ' is below this batch''s minimum bid quantity of ' || v_min || '.');
    END IF;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20003, 'Batch ' || p_batch_id || ' does not exist.');
  END check_bid_min_qty;

  -- BR-20 decides whether a payment may be taken at all, BR-19 whether
  -- this one would overshoot the order total. As a pre-insert check the
  -- sum has to include the incoming amount, which is why this is not a
  -- straight translation of the old AFTER STATEMENT trigger.
  PROCEDURE check_payment_allowed (p_sale_order_id IN NUMBER, p_amount IN NUMBER) IS
    v_terms           SALE_ORDER.PaymentTerms%TYPE;
    v_delivery_status TRANSPORT_REQUEST.DeliveryStatus%TYPE;
    v_total_amount    NUMBER;
    v_paid_so_far     NUMBER;
  BEGIN
    SELECT PaymentTerms, AcceptedQuantity * AcceptedPricePerKg
      INTO v_terms, v_total_amount
      FROM SALE_ORDER
     WHERE SaleOrderID = p_sale_order_id;

    IF v_terms = 'ON_DELIVERY' THEN
      BEGIN
        SELECT DeliveryStatus INTO v_delivery_status
          FROM TRANSPORT_REQUEST WHERE SaleOrderID = p_sale_order_id;
      EXCEPTION
        WHEN NO_DATA_FOUND THEN
          RAISE_APPLICATION_ERROR(-20002,
            'BR-20 violation: payment terms are ON_DELIVERY but no transport request exists yet.');
      END;

      IF v_delivery_status <> 'DELIVERED' THEN
        RAISE_APPLICATION_ERROR(-20002,
          'BR-20 violation: payment terms are ON_DELIVERY and delivery is not yet complete.');
      END IF;
    END IF;

    SELECT NVL(SUM(Amount), 0) INTO v_paid_so_far
      FROM PAYMENT
     WHERE SaleOrderID = p_sale_order_id
       AND PaymentType = 'SALE'
       AND PaymentStatus IN ('PENDING', 'COMPLETED');

    IF v_paid_so_far + p_amount > v_total_amount THEN
      RAISE_APPLICATION_ERROR(-20001,
        'BR-19 violation: payments against sale order ' || p_sale_order_id ||
        ' would total ' || (v_paid_so_far + p_amount) ||
        ' which exceeds the order total ' || v_total_amount || '.');
    END IF;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      RAISE_APPLICATION_ERROR(-20001, 'Sale order ' || p_sale_order_id || ' does not exist.');
  END check_payment_allowed;

  PROCEDURE check_one_personnel (p_transport_id IN NUMBER,
                                 p_personnel_id IN NUMBER,
                                 p_assignment_id IN NUMBER DEFAULT NULL) IS
    v_holder ASSIGNED_TO.PersonnelID%TYPE;
  BEGIN
    SELECT MIN(PersonnelID) INTO v_holder
      FROM ASSIGNED_TO
     WHERE TransportID = p_transport_id
       AND (p_assignment_id IS NULL OR AssignmentID <> p_assignment_id);

    IF v_holder IS NOT NULL AND v_holder <> p_personnel_id THEN
      RAISE_APPLICATION_ERROR(-20004,
        'Transport request ' || p_transport_id ||
        ' already belongs to another transport person. One request, one person.');
    END IF;
  END check_one_personnel;

  FUNCTION next_unit_no (p_warehouse_id IN NUMBER) RETURN NUMBER IS
    v_next NUMBER;
  BEGIN
    SELECT NVL(MAX(UnitNo), 0) + 1 INTO v_next
      FROM STORAGE_UNIT WHERE WarehouseID = p_warehouse_id;
    RETURN v_next;
  END next_unit_no;

END pkg_krishi_rules;
/
