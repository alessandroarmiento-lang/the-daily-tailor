#!/usr/bin/osascript
-- Fetch yesterday's inbox messages from Apple Mail as JSON.
-- Args (optional): maxItems (default 40)
on run argv
	set maxItems to 40
	if (count of argv) ≥ 1 then
		try
			set maxItems to (item 1 of argv) as integer
		end try
	end if

	set now to current date
	set endDay to date (short date string of now)
	set startDay to endDay - 1 * days

	tell application "Mail"
		set rows to {}
		try
			set msgs to (messages of inbox whose date received ≥ startDay and date received < endDay)
		on error errMsg number errNum
			return "{\"ok\":false,\"error\":\"Mail whose failed (" & errNum & "): " & my escapeJson(errMsg) & "\"}"
		end try

		set total to count of msgs
		set limit to total
		if limit > maxItems then set limit to maxItems

		repeat with i from 1 to limit
			try
				set m to item i of msgs
				set subj to subject of m as text
				set snd to sender of m as text
				set d to date received of m
				set iso to my isoFromDate(d)
				set flagged to false
				try
					set flagged to flagged status of m
				end try
				-- Skip full body fetch (very slow on large mailboxes).
				-- Actionable filter uses subject + sender + flagged.
				set preview to ""
				set msgId to ""
				try
					set msgId to message id of m as text
				end try
				set end of rows to my objectJson(msgId, subj, snd, iso, flagged, preview)
			end try
		end repeat
	end tell

	set AppleScript's text item delimiters to ","
	set body to rows as text
	set AppleScript's text item delimiters to ""
	return "{\"ok\":true,\"window\":\"yesterday\",\"total\":" & total & ",\"items\":[" & body & "]}"
end run

on isoFromDate(d)
	set y to year of d as integer
	set mo to (month of d) as integer
	set da to day of d as integer
	set h to hours of d as integer
	set mi to minutes of d as integer
	set se to seconds of d as integer
	return (y as text) & "-" & my pad2(mo) & "-" & my pad2(da) & "T" & my pad2(h) & ":" & my pad2(mi) & ":" & my pad2(se)
end isoFromDate

on pad2(n)
	set s to n as text
	if length of s < 2 then return "0" & s
	return s
end pad2

on leftStr(t, n)
	if t is missing value then return ""
	set t to t as text
	if length of t ≤ n then return t
	return text 1 thru n of t
end leftStr

on escapeJson(t)
	set t to t as text
	set t to my replaceText(t, "\\", "\\\\")
	set t to my replaceText(t, "\"", "\\\"")
	set t to my replaceText(t, return, "\\n")
	set t to my replaceText(t, linefeed, "\\n")
	set t to my replaceText(t, tab, " ")
	return t
end escapeJson

on replaceText(t, findText, replaceWith)
	set AppleScript's text item delimiters to findText
	set parts to text items of t
	set AppleScript's text item delimiters to replaceWith
	set out to parts as text
	set AppleScript's text item delimiters to ""
	return out
end replaceText

on objectJson(msgId, subj, snd, iso, flagged, preview)
	set f to "false"
	if flagged then set f to "true"
	return "{\"id\":\"" & my escapeJson(msgId) & "\",\"subject\":\"" & my escapeJson(subj) & "\",\"sender\":\"" & my escapeJson(snd) & "\",\"receivedAt\":\"" & my escapeJson(iso) & "\",\"flagged\":" & f & ",\"preview\":\"" & my escapeJson(preview) & "\"}"
end objectJson
