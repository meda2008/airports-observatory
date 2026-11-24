'use strict';
// Explicit user deferrals. A later success/verification acknowledgement does
// not automatically revoke a request to skip a site.
const skippedRecordIds=new Set(['A033','A034','A047','A049','A068','A075','A080']);
module.exports={skippedRecordIds,isUserSkipped:id=>skippedRecordIds.has(id)};
