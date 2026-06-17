import React, { useState, useEffect } from 'react';
import type {
  Recommendation,
  RecommendationLifecycleStatus,
  RecommendationType,
  VerificationStatus,
  RecommendationCurrentOwner,
  SupplierResponseCategory
} from '@/src/types/procurementRecommendations';
import type { SupplierReminder, SupplierResponse } from '@/src/types/supplierCommunications';

export default function RecommendationWorklist() {
  // --- STATE ---
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Filters & Search
  const [selectedStatusTab, setSelectedStatusTab] = useState<string>('ALL_OPEN');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [showStatusGuide, setShowStatusGuide] = useState(false);

  // Selected Recommendation for Drawer
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);
  const [reminders, setReminders] = useState<SupplierReminder[]>([]);
  const [responses, setResponses] = useState<SupplierResponse[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Custom Closure Input State
  const [closureReason, setClosureReason] = useState('');
  const [showClosureForm, setShowClosureForm] = useState(false);

  // Supplier Reminder Email Form State
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // --- FETCH DATA ---
  const fetchRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recommendations');
      if (!res.ok) {
        throw new Error(`Failed to fetch recommendations: ${res.statusText}`);
      }
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error loading recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, selectedStatusTab]);

  // Fetch histories when selected recommendation changes
  useEffect(() => {
    if (!selectedRec) {
      setReminders([]);
      setResponses([]);
      return;
    }

    const fetchCommunicationHistory = async () => {
      setDrawerLoading(true);
      setDrawerError(null);
      try {
        const [remindersRes, responsesRes] = await Promise.all([
          fetch(`/api/supplier-communications/reminders?recommendationId=${selectedRec.recommendationId}`),
          fetch(`/api/supplier-communications/responses?recommendationId=${selectedRec.recommendationId}`)
        ]);

        if (!remindersRes.ok) throw new Error('Failed to fetch reminder history');
        if (!responsesRes.ok) throw new Error('Failed to fetch response history');

        const remindersData = await remindersRes.json();
        const responsesData = await responsesRes.json();

        // Sort both by creation date ascending for timeline chronological flow
        const sortedReminders = (remindersData.reminders || []).sort(
          (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const sortedResponses = (responsesData.responses || []).sort(
          (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        setReminders(sortedReminders);
        setResponses(sortedResponses);
      } catch (err: any) {
        console.error(err);
        setDrawerError(err.message || 'Error loading communication logs');
      } finally {
        setDrawerLoading(false);
      }
    };

    fetchCommunicationHistory();
    // Reset form states
    setShowClosureForm(false);
    setClosureReason('');
    setActionSuccess(null);
  }, [selectedRec]);

  // Reset email composer when selectedRec changes
  useEffect(() => {
    if (selectedRec) {
      const email = selectedRec.supplierEmail || (selectedRec as any).supplier_email || '';
      setEmailTo(email);
      setEmailCc('');
      setEmailSubject(`Reminder: Action Required on PO ${selectedRec.purchaseOrderNumber} / Item ${selectedRec.purchaseOrderItem}`);
      setEmailBody(
        `Dear ${selectedRec.supplierName} Team,\n\n` +
        `This is a query regarding Purchase Order ${selectedRec.purchaseOrderNumber}, Item ${selectedRec.purchaseOrderItem}.\n\n` +
        `Discrepancy Details:\n${selectedRec.issueReason}\n\n` +
        `Recommended Action:\n${selectedRec.recommendedActionText}\n\n` +
        `Please verify your schedule and confirm when we can expect delivery.\n\n` +
        `Best regards,\n` +
        `Buyer & Planner Team`
      );
      setShowEmailForm(false);
    } else {
      setEmailTo('');
      setEmailCc('');
      setEmailSubject('');
      setEmailBody('');
      setShowEmailForm(false);
    }
  }, [selectedRec]);

  const handleSendReminderEmail = async () => {
    if (!selectedRec) return;
    if (!emailTo.trim()) {
      setDrawerError('Cannot send reminder because supplier email is missing.');
      return;
    }

    setActionProcessing(true);
    setDrawerError(null);
    setActionSuccess(null);

    try {
      const ccList = emailCc.split(',').map(email => email.trim()).filter(email => email.length > 0);
      
      const res = await fetch('/api/supplier-communications/reminders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId: selectedRec.recommendationId,
          recipientEmail: emailTo.trim(),
          ccEmails: ccList,
          subject: emailSubject.trim(),
          body: emailBody.trim(),
          sentBy: 'buyer.demo'
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setActionSuccess(data.message);
        setShowEmailForm(false);
        
        // Refresh details (which will trigger re-fetch of logs)
        const updatedRes = await fetch(`/api/recommendations/${selectedRec.recommendationId}`);
        if (updatedRes.ok) {
          const updatedRec = await updatedRes.json();
          setSelectedRec(updatedRec);
        }
        // Refresh recommendation list
        fetchRecommendations();
      } else {
        setDrawerError(data.error || 'Failed to send reminder email.');
      }
    } catch (err: any) {
      console.error('[handleSendReminderEmail] Error:', err);
      setDrawerError(err.message || 'Network error occurred while trying to send email.');
    } finally {
      setActionProcessing(false);
    }
  };

  // --- ACTIONS ---

  // Manually trigger verification
  const handleVerifyNow = async (rec: Recommendation) => {
    setActionProcessing(true);
    setActionSuccess(null);
    setDrawerError(null);
    try {
      const res = await fetch(`/api/recommendations/${rec.recommendationId}/verify`, {
        method: 'POST'
      });

      if (!res.ok) {
        let errMsg = 'Verification check failed';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        if (res.status === 409) {
          throw new Error('Stale Data Conflict: This recommendation was modified by another process. Please refresh the worklist to get the latest version.');
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      setActionSuccess(result.message || 'Verification complete.');
      // Refresh current selection
      const updatedRes = await fetch(`/api/recommendations/${rec.recommendationId}`);
      if (updatedRes.ok) {
        const updatedRec = await updatedRes.json();
        setSelectedRec(updatedRec);
      }
      // Refresh list
      fetchRecommendations();
    } catch (err: any) {
      console.error(err);
      setDrawerError(err.message || 'Verification failed');
    } finally {
      setActionProcessing(false);
    }
  };

  // Mark Manual update complete (transitions to VERIFICATION_PENDING)
  const handleConfirmManualUpdate = async (rec: Recommendation) => {
    setActionProcessing(true);
    setActionSuccess(null);
    setDrawerError(null);
    try {
      const res = await fetch(`/api/recommendations/${rec.recommendationId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextStatus: 'VERIFICATION_PENDING',
          expectedVersion: rec.version,
          updatedBy: 'buyer-workbench'
        })
      });

      if (!res.ok) {
        let errMsg = 'Failed to update recommendation status';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        if (res.status === 409) {
          throw new Error('Stale Data Conflict: This recommendation was modified by another process. Please refresh the worklist to get the latest version.');
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      setActionSuccess('Manual SAP action noted. Awaiting source refresh verification.');
      setSelectedRec(result);
      fetchRecommendations();
    } catch (err: any) {
      console.error(err);
      setDrawerError(err.message || 'Action update failed');
    } finally {
      setActionProcessing(false);
    }
  };

  // Transition status (e.g. ESCALATED, BLOCKED)
  const handleTransitionStatus = async (rec: Recommendation, targetStatus: RecommendationLifecycleStatus) => {
    setActionProcessing(true);
    setActionSuccess(null);
    setDrawerError(null);
    try {
      const res = await fetch(`/api/recommendations/${rec.recommendationId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextStatus: targetStatus,
          expectedVersion: rec.version,
          updatedBy: 'buyer-workbench'
        })
      });

      if (!res.ok) {
        let errMsg = 'Failed to update status';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        if (res.status === 409) {
          throw new Error('Stale Data Conflict: This recommendation was modified by another process. Please refresh the worklist to get the latest version.');
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      setActionSuccess(`Status transitioned to ${formatLifecycleStatus(targetStatus)}.`);
      setSelectedRec(result);
      fetchRecommendations();
    } catch (err: any) {
      console.error(err);
      setDrawerError(err.message || 'Status transition failed');
    } finally {
      setActionProcessing(false);
    }
  };

  // Close recommendation (transitions to CLOSED_NO_ACTION)
  const handleCloseRecommendation = async (rec: Recommendation) => {
    if (!closureReason.trim()) {
      setDrawerError('Please provide a reason for closing.');
      return;
    }
    setActionProcessing(true);
    setActionSuccess(null);
    setDrawerError(null);
    try {
      const res = await fetch(`/api/recommendations/${rec.recommendationId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextStatus: 'CLOSED_NO_ACTION',
          closureReason: closureReason.trim(),
          expectedVersion: rec.version,
          updatedBy: 'buyer-workbench'
        })
      });

      if (!res.ok) {
        let errMsg = 'Failed to close recommendation';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {}
        if (res.status === 409) {
          throw new Error('Stale Data Conflict: This recommendation was modified by another process. Please refresh the worklist to get the latest version.');
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      setActionSuccess('Recommendation manually closed.');
      setSelectedRec(result);
      setShowClosureForm(false);
      setClosureReason('');
      fetchRecommendations();
    } catch (err: any) {
      console.error(err);
      setDrawerError(err.message || 'Failed to close recommendation');
    } finally {
      setActionProcessing(false);
    }
  };

  // --- FILTERS & MATCHES ---
  const isClosedStatus = (status: RecommendationLifecycleStatus) =>
    status === 'CONFIRMED_RESOLVED' || status === 'CLOSED_NO_ACTION';

  const filteredRecommendations = recommendations.filter(rec => {
    // 1. Filter by Status Tab
    if (selectedStatusTab === 'ALL_OPEN') {
      if (isClosedStatus(rec.lifecycleStatus)) return false;
    } else if (selectedStatusTab === 'PENDING_SUPPLIER_RESPONSE') {
      if (rec.lifecycleStatus !== 'PENDING_SUPPLIER_RESPONSE') return false;
    } else if (selectedStatusTab === 'SUPPLIER_RESPONDED') {
      if (rec.lifecycleStatus !== 'SUPPLIER_RESPONDED') return false;
    } else if (selectedStatusTab === 'PENDING_BUYER_SAP_UPDATE') {
      if (rec.lifecycleStatus !== 'PENDING_BUYER_SAP_UPDATE') return false;
    } else if (selectedStatusTab === 'VERIFICATION_PENDING') {
      if (rec.lifecycleStatus !== 'VERIFICATION_PENDING') return false;
    } else if (selectedStatusTab === 'PENDING_BUYER_ACTION') {
      if (rec.lifecycleStatus !== 'PENDING_BUYER_ACTION') return false;
    } else if (selectedStatusTab === 'ESCALATED_BLOCKED') {
      if (rec.lifecycleStatus !== 'ESCALATED' && rec.lifecycleStatus !== 'BLOCKED') return false;
    } else if (selectedStatusTab === 'CLOSED') {
      if (!isClosedStatus(rec.lifecycleStatus)) return false;
    }

    // 2. Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesPo = rec.purchaseOrderNumber.toLowerCase().includes(q);
      const matchesItem = rec.purchaseOrderItem.toLowerCase().includes(q);
      const matchesSupplier = rec.supplierName.toLowerCase().includes(q);
      const matchesReason = rec.issueReason.toLowerCase().includes(q);
      const matchesSummary = (rec.interpretedSummary || '').toLowerCase().includes(q);
      
      if (!matchesPo && !matchesItem && !matchesSupplier && !matchesReason && !matchesSummary) {
        return false;
      }
    }

    // 3. Filter by Type Selector
    if (typeFilter) {
      if (rec.recommendationType !== typeFilter) return false;
    }

    return true;
  });

  const totalEntries = filteredRecommendations.length;
  const totalPages = Math.ceil(totalEntries / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalEntries);
  const paginatedRecommendations = filteredRecommendations.slice(startIndex, endIndex);

  // --- COUNTERS FOR METRICS ---
  const totalOpen = recommendations.filter(r => !isClosedStatus(r.lifecycleStatus)).length;
  const buyerActionCount = recommendations.filter(
    r => !isClosedStatus(r.lifecycleStatus) && r.currentOwner === 'BUYER'
  ).length;
  const supplierPendingCount = recommendations.filter(
    r => r.lifecycleStatus === 'PENDING_SUPPLIER_RESPONSE'
  ).length;
  const erpSyncCount = recommendations.filter(
    r => r.lifecycleStatus === 'VERIFICATION_PENDING' || r.lifecycleStatus === 'PENDING_BUYER_SAP_UPDATE'
  ).length;

  // --- FORMATTING HELPERS ---
  const formatDate = (isoString: string) => {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatLifecycleStatus = (status: RecommendationLifecycleStatus): string => {
    switch (status) {
      case 'PENDING_SUPPLIER_RESPONSE':
        return 'Awaiting Supplier Response';
      case 'SUPPLIER_RESPONDED':
        return 'Supplier Response Interpreted';
      case 'PENDING_BUYER_SAP_UPDATE':
        return 'Recommended Manual SAP Update';
      case 'VERIFICATION_PENDING':
        return 'Awaiting Source Refresh';
      case 'PENDING_BUYER_ACTION':
        return 'Buyer Action Required';
      case 'ESCALATED':
        return 'Escalated Exception';
      case 'BLOCKED':
        return 'Blocked';
      case 'CONFIRMED_RESOLVED':
        return 'Verified After Source Sync';
      case 'CLOSED_NO_ACTION':
        return 'Closed Without Action';
      default:
        return status ? status.replace(/_/g, ' ') : '';
    }
  };

  const formatOwner = (owner: RecommendationCurrentOwner | string): string => {
    switch (owner) {
      case 'BUYER':
        return 'Buyer Action Required';
      case 'SUPPLIER':
        return 'Awaiting Supplier Response';
      case 'SYSTEM':
      case 'SOURCE_SYSTEM':
        return 'Awaiting Source Refresh / Verification';
      case 'NONE':
        return 'None';
      default:
        return owner ? owner.replace(/_/g, ' ') : 'None';
    }
  };

  const formatVerificationStatus = (vStatus: VerificationStatus): string => {
    switch (vStatus) {
      case 'PASSED':
        return 'Verification Passed';
      case 'FAILED':
        return 'Verification Failed';
      case 'PENDING_NEXT_SYNC':
        return 'Awaiting Next Sync';
      case 'MANUALLY_CLOSED':
        return 'Manually Closed';
      case 'NOT_READY':
        return 'Not Started';
      default:
        return vStatus ? (vStatus as string).replace(/_/g, ' ') : 'Not Started';
    }
  };

  const getStatusBadgeStyles = (status: RecommendationLifecycleStatus) => {
    switch (status) {
      case 'PENDING_SUPPLIER_RESPONSE':
        return { bg: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#d97706' };
      case 'SUPPLIER_RESPONDED':
        return { bg: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#2563eb' };
      case 'PENDING_BUYER_SAP_UPDATE':
        return { bg: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#7c3aed' };
      case 'VERIFICATION_PENDING':
        return { bg: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#059669' };
      case 'PENDING_BUYER_ACTION':
        return { bg: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.3)', color: '#db2777' };
      case 'ESCALATED':
        return { bg: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#dc2626' };
      case 'BLOCKED':
        return { bg: 'rgba(107, 114, 128, 0.1)', border: '1px solid rgba(107, 114, 128, 0.3)', color: '#4b5563' };
      case 'CONFIRMED_RESOLVED':
        return { bg: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', color: 'var(--color-success)' };
      case 'CLOSED_NO_ACTION':
        return { bg: 'rgba(156, 163, 175, 0.15)', border: '1px solid rgba(156, 163, 175, 0.4)', color: 'var(--text-muted)' };
      default:
        return { bg: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' };
    }
  };

  const getVerificationBadgeStyles = (vStatus: VerificationStatus) => {
    switch (vStatus) {
      case 'PASSED':
        return { bg: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-success)' };
      case 'FAILED':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--severity-critical-text)' };
      case 'PENDING_NEXT_SYNC':
        return { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' };
      case 'MANUALLY_CLOSED':
        return { bg: 'rgba(107, 114, 128, 0.15)', color: 'var(--text-muted)' };
      case 'NOT_READY':
        return { bg: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' };
      default:
        return { bg: 'transparent', color: 'var(--text-muted)' };
    }
  };

  // Next steps instructions mapper complying with WORDING SAFEGUARDS
  const getNextStepText = (rec: Recommendation) => {
    switch (rec.lifecycleStatus) {
      case 'PENDING_SUPPLIER_RESPONSE':
        return 'Awaiting supplier confirmation. View logged reminder and wait for response email mock capture.';
      case 'SUPPLIER_RESPONDED':
        return 'Supplier response interpreted. Review details in drawer below. Take recommended manual action in ERP if acceptable.';
      case 'PENDING_BUYER_SAP_UPDATE':
        return `Recommended manual SAP update required: change ${rec.recommendedSapField || 'value'} to '${rec.recommendedSapValue || ''}' in SAP. Once complete, click "Confirm manual SAP action completed".`;
      case 'VERIFICATION_PENDING':
        return 'Awaiting source refresh. The verification engine will check the refurbished ERP line during the next sync.';
      case 'PENDING_BUYER_ACTION':
        return 'Buyer action required. Check recommendation details, issue description, and resolve manually.';
      case 'ESCALATED':
        return 'Escalated exception. Coordinate with materials lead or escalate with supplier manager.';
      case 'BLOCKED':
        return `Blocked: ${rec.verificationMessage || rec.closureReason || 'Verify identifiers and correct contact.'}`;
      case 'CONFIRMED_RESOLVED':
        return 'Verified after source sync. The expected value matches refurbished source data. No further action needed.';
      case 'CLOSED_NO_ACTION':
        return `Closed without action. Reason: ${rec.closureReason || 'Manually resolved / closed.'}`;
      default:
        return 'Evaluate recommendations and take appropriate workflow actions.';
    }
  };

  // Skeletons
  const renderTableSkeleton = () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '0.5rem' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1.2fr 2fr 1.2fr 1.5fr 1.2fr 1.2fr 1fr',
          gap: '1rem',
          padding: '0.85rem 0.75rem',
          borderBottom: '1px solid var(--border-color)',
          alignItems: 'center',
          animation: 'pulse 1.5s infinite ease-in-out'
        }}>
          <div style={{ height: '0.8rem', background: 'var(--border-color)', borderRadius: '0.25rem', width: '70%' }}></div>
          <div style={{ height: '0.8rem', background: 'var(--border-color)', borderRadius: '0.25rem', width: '60%' }}></div>
          <div style={{ height: '0.8rem', background: 'var(--border-color)', borderRadius: '0.25rem', width: '85%' }}></div>
          <div style={{ height: '0.8rem', background: 'var(--border-color)', borderRadius: '0.25rem', width: '50%' }}></div>
          <div style={{ height: '0.8rem', background: 'var(--border-color)', borderRadius: '0.25rem', width: '75%' }}></div>
          <div style={{ height: '0.8rem', background: 'var(--border-color)', borderRadius: '0.25rem', width: '40%' }}></div>
          <div style={{ height: '0.8rem', background: 'var(--border-color)', borderRadius: '0.25rem', width: '60%' }}></div>
          <div style={{ height: '0.8rem', background: 'var(--border-color)', borderRadius: '0.25rem', width: '50%' }}></div>
        </div>
      ))}
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 0.3; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );

  const renderHistorySkeleton = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', padding: '0.5rem 0' }}>
      {[1, 2].map((i) => (
        <div key={i} style={{
          borderLeft: '2px solid var(--border-color)',
          paddingLeft: '0.5rem',
          paddingBottom: '0.5rem',
          animation: 'pulse 1.5s infinite ease-in-out'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <div style={{ height: '0.6rem', background: 'var(--border-color)', borderRadius: '0.15rem', width: '40%' }}></div>
            <div style={{ height: '0.6rem', background: 'var(--border-color)', borderRadius: '0.15rem', width: '20%' }}></div>
          </div>
          <div style={{ height: '0.7rem', background: 'var(--border-color)', borderRadius: '0.15rem', width: '80%', marginBottom: '0.2rem' }}></div>
          <div style={{ height: '0.6rem', background: 'var(--border-color)', borderRadius: '0.15rem', width: '90%' }}></div>
        </div>
      ))}
    </div>
  );

  // --- RENDERING ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', height: '100%', flex: 1 }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
            Recommendation Worklist
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Inspect purchase order exceptions, evaluate supplier confirmations, and verify manual updates after sync.
          </p>
        </div>
      </div>

      {/* METRICS CARDS */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.75rem',
      }}>
        {[
          { title: 'Total Open Exceptions', value: loading ? '...' : totalOpen, desc: 'Awaiting completion/verify' },
          { title: 'Buyer Action Required', value: loading ? '...' : buyerActionCount, desc: 'Owned by Buyer', highlight: buyerActionCount > 0 },
          { title: 'Awaiting Supplier Response', value: loading ? '...' : supplierPendingCount, desc: 'Reminder sent', warning: supplierPendingCount > 0 },
          { title: 'Awaiting ERP Refresh Sync', value: loading ? '...' : erpSyncCount, desc: 'Awaiting source refresh', info: erpSyncCount > 0 },
        ].map((card, i) => {
          let borderStyle = '1px solid var(--border-color)';
          let valueColor = 'var(--text-primary)';
          if (card.highlight) {
            borderStyle = '1px solid rgba(236, 72, 153, 0.4)';
            valueColor = '#db2777';
          } else if (card.warning) {
            borderStyle = '1px solid rgba(245, 158, 11, 0.4)';
            valueColor = '#d97706';
          } else if (card.info) {
            borderStyle = '1px solid rgba(79, 70, 229, 0.4)';
            valueColor = 'var(--color-primary)';
          }

          return (
            <div key={i} style={{
              background: 'var(--bg-surface)',
              border: borderStyle,
              borderRadius: '0.5rem',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-sm)',
            }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                {card.title}
              </span>
              <span style={{ 
                fontSize: '1.25rem', 
                fontWeight: 700, 
                color: valueColor, 
                margin: '0.25rem 0'
              }}>
                {card.value}
              </span>
              <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                {card.desc}
              </span>
            </div>
          );
        })}
      </section>

      {/* LIFECYCLE GUIDE COMPONENT */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '0.5rem',
        padding: '0.75rem 1rem',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem' }}>📖</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Recommendation Lifecycle Status Guide
            </span>
          </div>
          <button
            onClick={() => setShowStatusGuide(!showStatusGuide)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-primary)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '0.25rem 0.5rem'
            }}
          >
            {showStatusGuide ? 'Hide Status Guide ▲' : 'Show Status Guide ▼'}
          </button>
        </div>
        
        {showStatusGuide && (
          <div style={{
            marginTop: '0.75rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '0.75rem',
            borderTop: '1px dashed var(--border-color)',
            paddingTop: '0.75rem',
            fontSize: '0.7rem',
            color: 'var(--text-secondary)'
          }}>
            {[
              { name: 'Awaiting Supplier Response', code: 'PENDING_SUPPLIER_RESPONSE', desc: 'Waiting for the supplier to confirm or dispute the PO changes.' },
              { name: 'Supplier Response Interpreted', code: 'SUPPLIER_RESPONDED', desc: 'The supplier responded. The system has parsed their response and suggested next steps.' },
              { name: 'Recommended Manual SAP Update', code: 'PENDING_BUYER_SAP_UPDATE', desc: 'The buyer needs to manually enter the recommended updates inside SAP.' },
              { name: 'Awaiting Source Refresh', code: 'VERIFICATION_PENDING', desc: 'Manual SAP action is logged; waiting for the next scheduled sync to verify the PO changes.' },
              { name: 'Buyer Action Required', code: 'PENDING_BUYER_ACTION', desc: 'The recommendation requires immediate buyer manual review and decision-making.' },
              { name: 'Escalated Exception', code: 'ESCALATED', desc: 'The issue has been flagged for escalations, coordinating with materials leads or managers.' },
              { name: 'Blocked', code: 'BLOCKED', desc: 'Execution is currently blocked (e.g. supplier contact missing, incorrect order type, etc.).' },
              { name: 'Verified After Source Sync', code: 'CONFIRMED_RESOLVED', desc: 'The sync completed, and the verification engine confirmed the PO changes match expectations.' },
              { name: 'Closed Without Action', code: 'CLOSED_NO_ACTION', desc: 'The buyer chose to manually close this recommendation without updating SAP.' }
            ].map((g, idx) => (
              <div key={idx} style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.375rem',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{g.name}</span>
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', padding: '0.05rem 0.2rem', borderRadius: '0.15rem' }}>{g.code}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{g.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FILTER AND SEARCH BAR */}
      <section style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '0.5rem',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '0.75rem', alignItems: 'end' }}>
          
          {/* Search */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Search PO / Supplier / Summary
            </label>
            <input 
              type="text" 
              placeholder="Ex. 4500000437, Test Supplier, June 18..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.375rem',
                padding: '0.4rem 0.6rem',
                fontSize: '0.75rem',
                color: 'var(--text-primary)',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>

          {/* Type Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Recommendation Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.375rem',
                padding: '0.4rem 0.6rem',
                fontSize: '0.75rem',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              <option value="">All Types</option>
              <option value="SEND_SUPPLIER_REMINDER">Send Supplier Reminder</option>
              <option value="REQUEST_ACKNOWLEDGEMENT">Request Acknowledgement</option>
              <option value="UPDATE_SAP_DELIVERY_DATE_MANUALLY">Recommended delivery date update</option>
              <option value="UPDATE_SAP_QUANTITY_MANUALLY">Recommended quantity update</option>
              <option value="ESCALATE_SUPPLIER">Escalate Supplier</option>
              <option value="NO_ACTION_REQUIRED">No Action Required</option>
            </select>
          </div>

        </div>

        {/* Tab filters for Lifecycle Status */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
          {[
            { id: 'ALL_OPEN', label: 'All Open' },
            { id: 'PENDING_SUPPLIER_RESPONSE', label: 'Pending Response' },
            { id: 'SUPPLIER_RESPONDED', label: 'Responded' },
            { id: 'PENDING_BUYER_SAP_UPDATE', label: 'Pending SAP Update' },
            { id: 'VERIFICATION_PENDING', label: 'Verification Pending' },
            { id: 'PENDING_BUYER_ACTION', label: 'Buyer Action Required' },
            { id: 'ESCALATED_BLOCKED', label: 'Escalated / Blocked' },
            { id: 'CLOSED', label: 'Resolved / Closed' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatusTab(tab.id)}
              style={{
                background: selectedStatusTab === tab.id ? 'var(--color-primary)' : 'rgba(255,255,255,0.02)',
                border: selectedStatusTab === tab.id ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                color: selectedStatusTab === tab.id ? '#ffffff' : 'var(--text-secondary)',
                borderRadius: '0.375rem',
                padding: '0.3rem 0.6rem',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

      </section>

      {/* RECOMMENDATIONS TABLE GRID */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '0.5rem',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column'
      }}>
      <section style={{ overflowX: 'auto' }}>
        {loading ? (
          renderTableSkeleton()
        ) : error ? (
          <div style={{
            padding: '3rem 2rem',
            textAlign: 'center',
            background: 'rgba(239, 68, 68, 0.03)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem'
          }}>
            <span style={{ fontSize: '2rem' }}>⚠️</span>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--severity-critical-text)', margin: 0 }}>
              Failed to Load Recommendation Data
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0, maxWidth: '300px', lineHeight: 1.4 }}>
              {error || 'An unexpected error occurred while loading the recommendation records.'}
            </p>
            <button
              onClick={fetchRecommendations}
              style={{
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.4rem 0.8rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '0.25rem'
              }}
            >
              🔄 Retry Loading
            </button>
          </div>
        ) : filteredRecommendations.length === 0 ? (
          <div style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem'
          }}>
            <span style={{ fontSize: '2rem' }}>📂</span>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              No Recommendations Found
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: 0, maxWidth: '280px', lineHeight: 1.4 }}>
              No recommendations match your current filters or search query.
            </p>
            {(searchQuery || typeFilter || selectedStatusTab !== 'ALL_OPEN') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('');
                  setSelectedStatusTab('ALL_OPEN');
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-primary)',
                  color: 'var(--color-primary)',
                  borderRadius: '0.375rem',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginTop: '0.25rem'
                }}
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface-elevated)' }}>
                  <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.6875rem' }}>PO / Item</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.6875rem' }}>Supplier</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.6875rem' }}>Issue & Type</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.6875rem' }}>Owner</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.6875rem' }}>Status</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.6875rem' }}>Expected Sync Value</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.6875rem' }}>Verification</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.6875rem' }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecommendations.map((rec) => {
                  const badge = getStatusBadgeStyles(rec.lifecycleStatus);
                  const isSelected = selectedRec?.recommendationId === rec.recommendationId;
                  const vStyles = getVerificationBadgeStyles(rec.verificationStatus);

                  return (
                    <tr
                      key={rec.recommendationId}
                      data-testid={`rec-row-${rec.purchaseOrderNumber}-${rec.purchaseOrderItem}`}
                      onClick={() => setSelectedRec(rec)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(79, 70, 229, 0.05)' : 'transparent',
                        transition: 'background 0.15s ease'
                      }}
                      className="table-row-hover"
                    >
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                        <div>{rec.purchaseOrderNumber}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>
                          Item {rec.purchaseOrderItem}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div>{rec.supplierName}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>{rec.supplierId}</div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 500 }}>{rec.recommendationType?.replace(/_/g, ' ') || ''}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                          {rec.issueReason}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                        {formatOwner(rec.currentOwner)}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{
                          display: 'inline-block',
                          borderRadius: '0.25rem',
                          padding: '0.15rem 0.35rem',
                          fontSize: '0.65rem',
                          fontWeight: 600,
                          backgroundColor: badge.bg,
                          border: badge.border,
                          color: badge.color
                        }}>
                          {formatLifecycleStatus(rec.lifecycleStatus)}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {rec.expectedValueAfterSync ? (
                          <div>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>
                              {rec.verificationField || rec.recommendedSapField || 'value'}:
                            </span>
                            <span style={{ fontWeight: 600, marginLeft: '0.2rem' }}>{rec.expectedValueAfterSync}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {rec.verificationStatus !== 'NOT_READY' ? (
                          <span style={{
                            display: 'inline-block',
                            borderRadius: '0.25rem',
                            padding: '0.1rem 0.3rem',
                            fontSize: '0.65rem',
                            fontWeight: 500,
                            backgroundColor: vStyles.bg,
                            color: vStyles.color
                          }}>
                            {formatVerificationStatus(rec.verificationStatus)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                        {formatDate(rec.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* Pagination Controls — outside the overflow-clipped section */}
      {!loading && !error && totalEntries > 0 && (
        <div style={{
          padding: '0.65rem 0.75rem',
          borderTop: '1px solid var(--border-color)',
          fontSize: '0.7rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          flexShrink: 0
        }}>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Showing {startIndex + 1}–{endIndex} of <strong style={{ color: 'var(--text-primary)' }}>{totalEntries}</strong> recommendations
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '0.25rem 0.6rem',
                borderRadius: '0.25rem',
                border: '1px solid var(--border-color)',
                background: currentPage === 1 ? 'transparent' : 'var(--bg-surface-elevated)',
                color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                cursor: currentPage === 1 ? 'default' : 'pointer',
                fontSize: '0.7rem',
                fontWeight: 600
              }}
            >
              ‹ Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ color: 'var(--text-muted)' }}>…</span>}
                  <button
                    onClick={() => setCurrentPage(p)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid',
                      borderColor: currentPage === p ? 'var(--color-primary)' : 'var(--border-color)',
                      background: currentPage === p ? 'rgba(79,70,229,0.15)' : 'var(--bg-surface-elevated)',
                      color: currentPage === p ? 'var(--color-primary)' : 'var(--text-secondary)',
                      fontWeight: currentPage === p ? 700 : 400,
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      minWidth: '1.8rem'
                    }}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '0.25rem 0.6rem',
                borderRadius: '0.25rem',
                border: '1px solid var(--border-color)',
                background: currentPage === totalPages ? 'transparent' : 'var(--bg-surface-elevated)',
                color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                cursor: currentPage === totalPages ? 'default' : 'pointer',
                fontSize: '0.7rem',
                fontWeight: 600
              }}
            >
              Next ›
            </button>
          </div>
          <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Page {currentPage} of {totalPages} · Click row to view details →
          </span>
        </div>
      )}
      </div>

      {/* DEV FOOTNOTE BADGE */}
      <footer style={{
        textAlign: 'center',
        padding: '0.5rem',
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
        border: '1px dashed var(--border-color)',
        borderRadius: '0.375rem',
        background: 'rgba(255,255,255,0.01)',
        marginTop: '0.5rem'
      }}>
        🔧 <strong>Dev Mode Instruction:</strong> To reset this demo workbench state to its baseline seeds, run: <code style={{ color: 'var(--color-primary)', background: 'rgba(255,255,255,0.04)', padding: '0.1rem 0.3rem', borderRadius: '0.15rem' }}>node scripts/reset-demo-state.js</code> in your terminal.
      </footer>

      {/* PROCUREMENT CONTEXT SIDE PANEL DRAWER */}
      <div style={{
        position: 'fixed',
        top: '1.25rem',
        bottom: '1.25rem',
        right: selectedRec ? '1.25rem' : '-500px',
        width: '450px',
        opacity: selectedRec ? 1 : 0,
        transition: 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s',
        background: 'var(--bg-surface)',
        borderLeft: selectedRec ? '1px solid var(--border-color)' : 'none',
        borderRadius: '0.5rem',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-drawer)',
        zIndex: 100
      }}>
        {selectedRec && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '450px' }}>
            
            {/* Drawer Header */}
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-elevated)' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Recommendation Control
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  PO {selectedRec.purchaseOrderNumber} / Item {selectedRec.purchaseOrderItem}
                </span>
              </div>
              <button 
                onClick={() => setSelectedRec(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer', outline: 'none' }}
              >
                ✕
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* SECTION 1: 🔍 CURRENT SITUATION */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                padding: '0.85rem',
                background: 'var(--bg-surface-elevated)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>🔍</span> Current Situation
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Status</span>
                    <span style={{
                      display: 'inline-block',
                      borderRadius: '0.25rem',
                      padding: '0.15rem 0.4rem',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      backgroundColor: getStatusBadgeStyles(selectedRec.lifecycleStatus).bg,
                      border: getStatusBadgeStyles(selectedRec.lifecycleStatus).border,
                      color: getStatusBadgeStyles(selectedRec.lifecycleStatus).color
                    }}>
                      {formatLifecycleStatus(selectedRec.lifecycleStatus)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Current Owner</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatOwner(selectedRec.currentOwner)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Issue Type</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {selectedRec.recommendationType?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Detected Discrepancy</span>
                    <div style={{
                      padding: '0.4rem 0.6rem',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.25rem',
                      color: 'var(--text-primary)',
                      lineHeight: 1.3
                    }}>
                      {selectedRec.issueReason}
                    </div>
                  </div>

                  {selectedRec.interpretedSummary && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Supplier Response Interpreted</span>
                      <div style={{
                        padding: '0.4rem 0.6rem',
                        background: 'rgba(59, 130, 246, 0.03)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        borderRadius: '0.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem'
                      }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedRec.interpretedSummary}</div>
                        {selectedRec.responseCategory && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            Category: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{selectedRec.responseCategory.replace(/_/g, ' ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2: ⚡ RECOMMENDED NEXT STEP */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                padding: '0.85rem',
                background: 'var(--bg-surface-elevated)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>⚡</span> Recommended Next Step
                </h4>
                
                <div style={{
                  background: 'rgba(79, 70, 229, 0.04)',
                  border: '1px solid rgba(79, 70, 229, 0.2)',
                  borderRadius: '0.375rem',
                  padding: '0.65rem 0.75rem',
                  fontSize: '0.72rem',
                  lineHeight: 1.35,
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.2rem', color: 'var(--color-primary)' }}>
                    Next Step Action Guidance
                  </div>
                  <p style={{ margin: 0 }}>
                    {getNextStepText(selectedRec)}
                  </p>
                </div>

                {/* Action inputs / buttons or read-only label */}
                {!isClosedStatus(selectedRec.lifecycleStatus) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                    
                    {/* Success / Error Alerts inside drawer action area */}
                    {actionSuccess && (
                      <div style={{ color: 'var(--color-success)', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.05)', padding: '0.3rem', borderRadius: '0.25rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                        {actionSuccess}
                      </div>
                    )}
                    {drawerError && (
                      <div style={{ color: 'var(--severity-critical-text)', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(239, 68, 68, 0.05)', padding: '0.3rem', borderRadius: '0.25rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        {drawerError}
                      </div>
                    )}

                    {/* Primary Action Button */}
                    {selectedRec.lifecycleStatus === 'PENDING_BUYER_SAP_UPDATE' && (
                      <button
                        disabled={actionProcessing}
                        onClick={() => handleConfirmManualUpdate(selectedRec)}
                        style={{
                          background: 'var(--color-primary)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '0.375rem',
                          padding: '0.45rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: actionProcessing ? 'not-allowed' : 'pointer',
                          opacity: actionProcessing ? 0.7 : 1,
                          transition: 'opacity 0.2s'
                        }}
                      >
                        {actionProcessing ? 'Processing...' : 'Confirm manual SAP action completed'}
                      </button>
                    )}

                    {/* Send Reminder Composer and Button */}
                    {!showEmailForm ? (
                      (!['CONFIRMED_RESOLVED', 'CLOSED_NO_ACTION', 'ESCALATED', 'BLOCKED'].includes(selectedRec.lifecycleStatus) &&
                        ['SEND_SUPPLIER_REMINDER', 'REQUEST_ACKNOWLEDGEMENT'].includes(selectedRec.recommendationType)) ? (
                        <button
                          disabled={actionProcessing}
                          data-testid="recommendation-send-reminder-trigger-btn"
                          onClick={() => setShowEmailForm(true)}
                          style={{
                            background: 'var(--color-primary)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '0.375rem',
                            padding: '0.45rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: actionProcessing ? 'not-allowed' : 'pointer',
                            opacity: actionProcessing ? 0.7 : 1,
                            transition: 'opacity 0.2s',
                            width: '100%'
                          }}
                        >
                          ✉️ Send Reminder
                        </button>
                      ) : (['ESCALATED', 'BLOCKED'].includes(selectedRec.lifecycleStatus) &&
                           ['SEND_SUPPLIER_REMINDER', 'REQUEST_ACKNOWLEDGEMENT'].includes(selectedRec.recommendationType)) ? (
                        <div style={{
                          padding: '0.6rem 0.85rem',
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px dashed rgba(239, 68, 68, 0.3)',
                          borderRadius: '0.375rem',
                          color: '#f87171',
                          fontSize: '0.7rem',
                          lineHeight: 1.3,
                          marginTop: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}>
                          <span>⚠️</span>
                          <span><strong>Action Blocked/Escalated:</strong> This recommendation is in {selectedRec.lifecycleStatus} state. Prioritize internal buyer guidance and manager coordination. Supplier reminder follow-ups are restricted.</span>
                        </div>
                      ) : null
                    ) : (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        border: '1px solid var(--border-color)',
                        padding: '0.75rem',
                        borderRadius: '0.375rem',
                        background: 'var(--bg-main)',
                        marginTop: '0.25rem'
                      }}>
                        <div style={{ fontWeight: 700, fontSize: '0.72rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.3rem', marginBottom: '0.2rem' }}>
                          ✉️ Draft Supplier Reminder
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <label style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>To (Supplier Email)</label>
                          <input
                            type="email"
                            data-testid="recommendation-email-to-input"
                            value={emailTo}
                            onChange={(e) => setEmailTo(e.target.value)}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '0.25rem',
                              padding: '0.3rem',
                              fontSize: '0.7rem',
                              color: 'var(--text-primary)',
                              outline: 'none'
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <label style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>CC (Optional)</label>
                          <input
                            type="text"
                            data-testid="recommendation-email-cc-input"
                            placeholder="Ex: buyer.cc@example.com"
                            value={emailCc}
                            onChange={(e) => setEmailCc(e.target.value)}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '0.25rem',
                              padding: '0.3rem',
                              fontSize: '0.7rem',
                              color: 'var(--text-primary)',
                              outline: 'none'
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <label style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>Subject</label>
                          <input
                            type="text"
                            data-testid="recommendation-email-subject-input"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '0.25rem',
                              padding: '0.3rem',
                              fontSize: '0.7rem',
                              color: 'var(--text-primary)',
                              outline: 'none'
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <label style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)' }}>Message Body</label>
                          <textarea
                            rows={6}
                            data-testid="recommendation-email-body-input"
                            value={emailBody}
                            onChange={(e) => setEmailBody(e.target.value)}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '0.25rem',
                              padding: '0.35rem',
                              fontSize: '0.7rem',
                              color: 'var(--text-primary)',
                              fontFamily: 'inherit',
                              outline: 'none',
                              resize: 'vertical'
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'end', marginTop: '0.2rem' }}>
                          <button
                            disabled={actionProcessing}
                            data-testid="recommendation-email-send-cancel-btn"
                            onClick={() => { setShowEmailForm(false); setDrawerError(null); setActionSuccess(null); }}
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border-color)',
                              borderRadius: '0.25rem',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.68rem',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            disabled={actionProcessing || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()}
                            data-testid="recommendation-email-send-confirm-btn"
                            onClick={handleSendReminderEmail}
                            style={{
                              background: 'var(--color-primary)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '0.25rem',
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              cursor: (actionProcessing || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) ? 'not-allowed' : 'pointer',
                              opacity: (actionProcessing || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) ? 0.6 : 1
                            }}
                          >
                            {actionProcessing ? 'Sending...' : 'Confirm Send'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Verify Now Button */}
                    {(selectedRec.lifecycleStatus === 'VERIFICATION_PENDING' ||
                      selectedRec.lifecycleStatus === 'PENDING_BUYER_SAP_UPDATE' ||
                      selectedRec.lifecycleStatus === 'PENDING_BUYER_ACTION' ||
                      selectedRec.lifecycleStatus === 'ESCALATED' ||
                      selectedRec.lifecycleStatus === 'BLOCKED') && (
                      <button
                        disabled={actionProcessing}
                        onClick={() => handleVerifyNow(selectedRec)}
                        style={{
                          background: selectedRec.lifecycleStatus === 'VERIFICATION_PENDING' ? 'var(--color-primary)' : 'transparent',
                          color: selectedRec.lifecycleStatus === 'VERIFICATION_PENDING' ? '#ffffff' : 'var(--text-primary)',
                          border: selectedRec.lifecycleStatus === 'VERIFICATION_PENDING' ? 'none' : '1px solid var(--border-color)',
                          borderRadius: '0.375rem',
                          padding: '0.45rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: actionProcessing ? 'not-allowed' : 'pointer',
                          opacity: actionProcessing ? 0.7 : 1,
                          transition: 'all 0.2s'
                        }}
                      >
                        {actionProcessing ? 'Verifying...' : 'Verify Now'}
                      </button>
                    )}

                    {/* Transition Buttons */}
                    <div style={{ display: 'flex', gap: '0.35rem', width: '100%' }}>
                      {selectedRec.lifecycleStatus !== 'ESCALATED' && (
                        <button
                          disabled={actionProcessing}
                          onClick={() => handleTransitionStatus(selectedRec, 'ESCALATED')}
                          style={{
                            flex: 1,
                            background: 'rgba(239, 68, 68, 0.08)',
                            color: '#dc2626',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '0.375rem',
                            padding: '0.4rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: actionProcessing ? 'not-allowed' : 'pointer',
                            transition: 'background 0.2s'
                          }}
                        >
                          Escalate
                        </button>
                      )}

                      {selectedRec.lifecycleStatus !== 'BLOCKED' && (
                        <button
                          disabled={actionProcessing}
                          onClick={() => handleTransitionStatus(selectedRec, 'BLOCKED')}
                          style={{
                            flex: 1,
                            background: 'rgba(107, 114, 128, 0.08)',
                            color: '#4b5563',
                            border: '1px solid rgba(107, 114, 128, 0.25)',
                            borderRadius: '0.375rem',
                            padding: '0.4rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: actionProcessing ? 'not-allowed' : 'pointer',
                            transition: 'background 0.2s'
                          }}
                        >
                          Block
                        </button>
                      )}

                      {!showClosureForm && (
                        <button
                          disabled={actionProcessing}
                          data-testid="recommendation-close-trigger-btn"
                          onClick={() => setShowClosureForm(true)}
                          style={{
                            flex: 1,
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.375rem',
                            padding: '0.4rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                        >
                          Close...
                        </button>
                      )}
                    </div>

                    {/* Closure Form */}
                    {showClosureForm && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        border: '1px dashed var(--border-color)',
                        padding: '0.65rem',
                        borderRadius: '0.375rem',
                        marginTop: '0.25rem',
                        background: 'var(--bg-main)'
                      }}>
                        <label style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Reason for Closure (Required)
                        </label>
                        <input
                          type="text"
                          data-testid="recommendation-closure-reason-input"
                          placeholder="Ex. Vendor agreed, manual work completed..."
                          value={closureReason}
                          onChange={(e) => setClosureReason(e.target.value)}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.25rem',
                            padding: '0.35rem',
                            fontSize: '0.7rem',
                            color: 'var(--text-primary)',
                            outline: 'none'
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'end' }}>
                          <button
                            onClick={() => { setShowClosureForm(false); setClosureReason(''); }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              fontSize: '0.65rem',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleCloseRecommendation(selectedRec)}
                            disabled={actionProcessing || !closureReason.trim()}
                            data-testid="recommendation-confirm-close-btn"
                            style={{
                              background: 'var(--color-primary)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '0.2rem',
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              cursor: (!closureReason.trim() || actionProcessing) ? 'not-allowed' : 'pointer',
                              opacity: (!closureReason.trim() || actionProcessing) ? 0.6 : 1
                            }}
                          >
                            Confirm Close
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    padding: '0.5rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.375rem',
                    background: 'var(--bg-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem'
                  }}>
                    <span>🔒</span> Closed history is read-only. No further actions are available.
                  </div>
                )}
              </div>

              {/* SECTION 3: 📜 EVIDENCE & HISTORY */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                padding: '0.85rem',
                background: 'var(--bg-surface-elevated)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <h4 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>📜</span> Evidence & History
                </h4>

                {/* Expected Value & Verification Result */}
                <div style={{
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.375rem',
                  padding: '0.65rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  fontSize: '0.72rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Expected value after sync</span>
                    <span style={{ fontWeight: 600 }}>{selectedRec.expectedValueAfterSync || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Verification field</span>
                    <span style={{ fontStyle: 'italic' }}>{selectedRec.verificationField || selectedRec.recommendedSapField || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Verification Status</span>
                    <span style={{
                      borderRadius: '0.25rem',
                      padding: '0.1rem 0.35rem',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      backgroundColor: getVerificationBadgeStyles(selectedRec.verificationStatus).bg,
                      color: getVerificationBadgeStyles(selectedRec.verificationStatus).color
                    }}>
                      {formatVerificationStatus(selectedRec.verificationStatus)}
                    </span>
                  </div>
                  {selectedRec.verificationStatus === 'NOT_READY' && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', borderTop: '1px dashed var(--border-color)', paddingTop: '0.25rem', marginTop: '0.15rem' }}>
                      Verification will run once a manual update is confirmed and a sync is triggered.
                    </div>
                  )}
                  {selectedRec.verificationMessage && (
                    <div style={{
                      marginTop: '0.2rem',
                      borderTop: '1px dashed var(--border-color)',
                      paddingTop: '0.4rem',
                      color: selectedRec.verificationStatus === 'PASSED' ? 'var(--color-success)' : 'var(--severity-critical-text)',
                      fontSize: '0.68rem',
                      lineHeight: 1.25
                    }}>
                      {selectedRec.verificationMessage}
                    </div>
                  )}
                </div>

                {/* Supplier Communication History timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Supplier Communication History</span>
                  {drawerLoading ? (
                    renderHistorySkeleton()
                  ) : drawerError ? (
                    <span style={{ color: 'var(--severity-critical-text)', fontSize: '0.7rem' }}>{drawerError}</span>
                  ) : reminders.length === 0 && responses.length === 0 ? (
                    <div style={{
                      padding: '0.75rem',
                      textAlign: 'center',
                      background: 'var(--bg-main)',
                      border: '1px dashed var(--border-color)',
                      borderRadius: '0.25rem',
                      color: 'var(--text-muted)',
                      fontSize: '0.7rem'
                    }}>
                      No logged supplier reminders or responses found for this recommendation yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {(() => {
                        const timeline: { type: 'reminder' | 'response'; date: string; data: any }[] = [];
                        reminders.forEach(r => timeline.push({ type: 'reminder', date: r.sentAt || r.createdAt, data: r }));
                        responses.forEach(r => timeline.push({ type: 'response', date: r.respondedAt || r.createdAt, data: r }));
                        timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                        return timeline.map((log, index) => {
                          if (log.type === 'reminder') {
                            const rem = log.data as SupplierReminder;
                            return (
                              <div key={`rem-${index}`} style={{
                                borderLeft: '2px solid rgba(245, 158, 11, 0.4)',
                                paddingLeft: '0.5rem',
                                paddingBottom: '0.2rem'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                  <span style={{ fontWeight: 600, color: '#d97706' }}>✉️ Reminder Logged ({rem.channel})</span>
                                  <span>{formatDate(log.date)}</span>
                                </div>
                                <div style={{ fontWeight: 600, marginTop: '0.1rem', fontSize: '0.7rem' }}>{rem.subject}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', marginTop: '0.1rem', whiteSpace: 'pre-line' }}>{rem.bodyText}</div>
                              </div>
                            );
                          } else {
                            const resp = log.data as SupplierResponse;
                            return (
                              <div key={`resp-${index}`} style={{
                                borderLeft: '2px solid rgba(59, 130, 246, 0.4)',
                                paddingLeft: '0.5rem',
                                paddingBottom: '0.2rem'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                  <span style={{ fontWeight: 600, color: '#2563eb' }}>📥 Response Captured ({resp.channel})</span>
                                  <span>{formatDate(log.date)}</span>
                                </div>
                                <div style={{ fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', padding: '0.25rem', borderRadius: '0.2rem', marginTop: '0.1rem', color: 'var(--text-primary)', fontSize: '0.7rem' }}>
                                  "{resp.rawResponseText}"
                                </div>
                                {resp.interpretedSummary && (
                                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                                    Interpreted: <span style={{ fontWeight: 500 }}>{resp.interpretedSummary}</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                        });
                      })()}
                    </div>
                  )}
                </div>

                {/* Audit Fields */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  <div>Created: {formatDate(selectedRec.createdAt)} by {selectedRec.createdBy}</div>
                  <div>Last Updated: {formatDate(selectedRec.updatedAt)} by {selectedRec.updatedBy}</div>
                  <div>Record Version: {selectedRec.version}</div>
                  {selectedRec.closedAt && <div>Closed: {formatDate(selectedRec.closedAt)}</div>}
                </div>

              </div>

            </div>

          </div>
        )}
      </div>

    </div>
  );
}
