import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

function storagePathFor(batchId: string, candidateId: string, namaFile: string) {
  return `cv-files/${batchId}/${candidateId}_${namaFile}`
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Step 1: hapus file asli CV yang lebih dari 1 hari — teks ekstraksi di DB tetap disimpan
  const { data: candidatesToPurgeFile } = await admin
    .from('cv_candidates')
    .select('id, batch_id, nama_file')
    .lt('created_at', oneDayAgo)
    .is('file_deleted_at', null)
    .not('file_url', 'is', null)

  let filesDeleted = 0
  if (candidatesToPurgeFile?.length) {
    const paths = candidatesToPurgeFile.map(c => storagePathFor(c.batch_id, c.id, c.nama_file))
    const { error: removeError } = await admin.storage.from('cv-files').remove(paths)
    if (!removeError) {
      filesDeleted = paths.length
      await admin.from('cv_candidates')
        .update({ file_url: null, file_deleted_at: new Date().toISOString() })
        .in('id', candidatesToPurgeFile.map(c => c.id))
    }
  }

  // Step 2: hapus total batch + kandidat yang lebih dari 7 hari
  const { data: batchesToPurge } = await admin
    .from('cv_batches')
    .select('id')
    .lt('created_at', sevenDaysAgo)

  let batchesDeleted = 0
  let candidatesDeleted = 0
  if (batchesToPurge?.length) {
    const batchIds = batchesToPurge.map(b => b.id)

    // Safety net: hapus file yang mungkin belum sempat dibersihkan step 1
    const { data: leftoverCandidates } = await admin
      .from('cv_candidates')
      .select('id, batch_id, nama_file')
      .in('batch_id', batchIds)
      .is('file_deleted_at', null)
      .not('file_url', 'is', null)

    if (leftoverCandidates?.length) {
      const leftoverPaths = leftoverCandidates.map(c => storagePathFor(c.batch_id, c.id, c.nama_file))
      await admin.storage.from('cv-files').remove(leftoverPaths)
    }

    const { count } = await admin
      .from('cv_candidates')
      .delete({ count: 'exact' })
      .in('batch_id', batchIds)
    candidatesDeleted = count ?? 0

    await admin.from('cv_batches').delete().in('id', batchIds)
    batchesDeleted = batchIds.length
  }

  await admin.from('activity_logs').insert({
    user_id: null,
    action: 'auto_cleanup',
    status: 'success',
    detail: { files_deleted: filesDeleted, batches_deleted: batchesDeleted, candidates_deleted: candidatesDeleted },
  })

  return NextResponse.json({
    ok: true,
    files_deleted: filesDeleted,
    batches_deleted: batchesDeleted,
    candidates_deleted: candidatesDeleted,
  })
}
