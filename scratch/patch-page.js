const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, '..', 'app', 'page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// Normalize page newlines
content = content.replace(/\r\n/g, '\n');

// 1. Define computeSupplierSentiment function if not present
const sentimentHelper = `
const computeSupplierSentiment = (detail: any) => {
  if (!detail) return 'POSITIVE';
  if (detail.status === 'RESOLVED' || detail.status === 'CLOSED' || detail.lifecycleStatus === 'CLOSED' || detail.lifecycleStatus === 'CLOSED_NO_ACTION' || detail.lifecycleStatus === 'CONFIRMED_RESOLVED') {
    return 'POSITIVE';
  }
  const logs = detail.communication_logs || [];
  const committed = detail.acknowledgement_details?.committed_delivery_date;
  const requested = detail.requested_delivery_date;
  if (committed && requested && new Date(committed).getTime() > new Date(requested).getTime()) {
    return 'CAUTION';
  }
  if (detail.acknowledgement_status === 'MISSING') {
    return 'CAUTION';
  }
  const hasNegativeLogs = logs.some((l: any) => 
    l.sentiment === 'negative' || 
    l.body.toLowerCase().includes('delay') || 
    l.body.toLowerCase().includes('sorry') || 
    l.body.toLowerCase().includes('unable') || 
    l.body.toLowerCase().includes('backorder')
  );
  if (hasNegativeLogs) {
    return 'CAUTION';
  }
  const hasSupplierResponse = logs.some((l: any) => l.source_system === 'Supplier response received');
  if (hasSupplierResponse) {
    return 'POSITIVE';
  }
  return 'POSITIVE';
};
`;

if (!content.includes('const computeSupplierSentiment =')) {
  content = content.replace(
    "import RecommendationWorklist from '@/src/components/RecommendationWorklist';",
    "import RecommendationWorklist from '@/src/components/RecommendationWorklist';" + sentimentHelper
  );
  console.log('Inserted computeSupplierSentiment helper');
}

// 2. Perform target replacement of the timeline node
const targetKey = "Committed: {selectedDetail.acknowledgement_details?.committed_delivery_date || 'NO COMMIT DATE RECORDED'}";
const targetIndex = content.indexOf(targetKey);

if (targetIndex !== -1) {
  // Let's locate the enclosing timeline-node block.
  // We can find the </div> that closes this timeline-node block after the targetKey.
  const endBlock = content.indexOf('</div>', targetIndex);
  if (endBlock !== -1) {
    // The next </div> is the closing tag.
    // Let's replace the whole span/desc block inside.
    const targetSubstring = content.substring(targetIndex, endBlock);
    
    // We want to insert the check for late commitment date.
    // The targetSubstring currently is:
    // Committed: {selectedDetail.acknowledgement_details?.committed_delivery_date || 'NO COMMIT DATE RECORDED'}
    // </span>
    // <span className="timeline-title">Supplier Acknowledgement status</span>
    // <span className="timeline-desc">
    //   Status is <strong>{selectedDetail.acknowledgement_status}</strong>.
    //   {selectedDetail.acknowledgement_details && ` Committed for ${selectedDetail.acknowledgement_details.acknowledged_qty} pcs.`}
    // </span>
    
    const replacementSubstring = `Committed: {selectedDetail.acknowledgement_details?.committed_delivery_date || 'NO COMMIT DATE RECORDED'}
                                         </span>
                                         <span className="timeline-title">Supplier Acknowledgement status</span>
                                         <span className="timeline-desc">
                                           Status is <strong>{selectedDetail.acknowledgement_status}</strong>.
                                           {selectedDetail.acknowledgement_details && \` Committed for \${selectedDetail.acknowledgement_details.acknowledged_qty} pcs.\`}
                                           {(() => {
                                             const committed = selectedDetail.acknowledgement_details?.committed_delivery_date;
                                             const requested = selectedDetail.requested_delivery_date;
                                             if (committed && requested && new Date(committed).getTime() > new Date(requested).getTime()) {
                                               const lateDays = Math.round((new Date(committed).getTime() - new Date(requested).getTime()) / (1000 * 60 * 60 * 24));
                                               return <span style={{ display: 'block', color: 'var(--severity-critical-text)', fontWeight: 600, marginTop: '0.2rem' }}>⚠️ Late by {lateDays} days vs Requested Target</span>;
                                             }
                                             return null;
                                           })()}
                                         </span>`;

    content = content.replace(targetSubstring, replacementSubstring);
    console.log('Successfully patched timeline node!');
  } else {
    console.error('Could not find closing tag for timeline node');
  }
} else {
  console.error('Could not find target key in app/page.tsx');
}

fs.writeFileSync(pagePath, content, 'utf8');
console.log('app/page.tsx updated successfully!');
