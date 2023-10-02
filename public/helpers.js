export function getLocalEpoch(localDate, type = 'start') {
    const date = new Date(localDate)
    const startEpochMilliseconds = date.setHours(0, 0, 0, 0)
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

export function formatDateRange(startDate, endDate) {
    const currentYear = dayjs().year()
    const startYear = dayjs(startDate).year()
    const endYear = dayjs(endDate).year()
    const showYear = startYear !== endYear || startYear !== currentYear

    const startMonth = dayjs(startDate).month()
    const endMonth = dayjs(endDate).month()
    const sameYearAndMonth = startYear === endYear && startMonth === endMonth

    const isStartOfMonth = dayjs(startDate).date() === 1
    const isEndOfMonth = dayjs(endDate).date() === dayjs(endDate).endOf('month').date()

    const isStartOfYear = startMonth === 0 && isStartOfMonth
    const isEndOfYear = endMonth === 11 && isEndOfMonth
    const sameYear = startYear === endYear

    // if given dates are start of the month and end of month - then print only month and print year if not current year
    if (sameYearAndMonth && isStartOfMonth && isEndOfMonth) {
        const monthName = startYear === currentYear ? dayjs(startDate).format('MMMM') : dayjs(startDate).format('MMMM YYYY')
        return monthName
    }

    // if given dates are start of the year and end of the year - then print only year
    if (sameYear && isStartOfYear && isEndOfYear) {
        const year = dayjs(startDate).format('YYYY')
        return year
    }

    let startDateFormatted
    let endDateFormatted

    if (sameYearAndMonth) {
      startDateFormatted = dayjs(startDate).format('D')
      endDateFormatted = showYear ? dayjs(endDate).format('D MMMM YYYY') : dayjs(endDate).format('D MMMM')
    } else {
      startDateFormatted = showYear ? dayjs(startDate).format('D MMMM YYYY') : dayjs(startDate).format('D MMMM')
      endDateFormatted = showYear ? dayjs(endDate).format('D MMMM YYYY') : dayjs(endDate).format('D MMMM')
    }

    return `${startDateFormatted} - ${endDateFormatted}`
}
