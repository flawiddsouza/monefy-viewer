export function getLocalEpoch(localDate, type = 'start') {
    const date = new Date(localDate)
    const localOffset = date.getTimezoneOffset() * 60 * 1000
    const adjustedDate = new Date(date.getTime() + localOffset)

    const startEpochMilliseconds = adjustedDate.setHours(0, 0, 0, 0)
    const endEpochMilliseconds = startEpochMilliseconds + (24 * 60 * 60 * 1000) - 1

    if (type === 'start') {
       return startEpochMilliseconds
    } else if (type === 'end') {
       return endEpochMilliseconds;
    }
 }

export function formatDate(date) {
    return dayjs(date).format('dddd, D MMMM')
}
