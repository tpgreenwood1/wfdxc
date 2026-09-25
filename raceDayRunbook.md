# Race-day runbook (scorer)

## The day before
1. **Take a backup.** In the Neon console, open the project, go to **Branches**, create a branch from `main` and name it after the event (for example `before-all-saints`). This gives a restore point. Check how far back your Neon plan's point-in-time restore goes, as a second safety net.
2. **Check every school has its link.** On **Admin → Schools**, use **Share link** for any school that hasn't opened its page yet.
3. **Check the races.** On **Admin → Events → (event)**, make sure the list matches the races actually running. Add a missing race or cancel one that isn't running.

## During the event
- **Keep Today or the event page open.** Both update by themselves about every 20 seconds.
- **Chasing schools.** A race is only **ready** once every school has tapped **Race done** or **No runners** for it. Use **Share reminder** on the chase list, or tap **Mark done for them** once a teacher has told you in person.
- **Places to check.** Work through duplicate and missing places on each race page. **Accept tie** only when two runners genuinely shared a place. If another runner is later entered on that place, it's flagged again.
- **"Entered in more than one race."** This usually means results were typed into the wrong race. On the wrong race's page, open **Schools in this race** and use **Move entries…** to move that school's runners to the right race. Their places stay the same.
- **Finalise.** Use **Finalise N ready races**, or finalise one race from its page. The single-race button warns you about anything still outstanding.
- **Announcing.** **Print results** on the event page prints every race, one per page. Races that aren't finalised yet are marked PROVISIONAL.

## If a teacher can't get online
- Their entries are kept on their phone and save automatically when signal returns. They'll see "No signal — N entries are kept on this phone".
- If the race gets finalised before their phone reconnects, their form will list the entries that didn't make it. Add those on the race page with **+ Add result**.
- **Paper fallback.** Collect the school's paper list, then open that school's teacher link yourself (**Admin → Schools → Copy link**, or type its code) and enter the results on the normal entry form. That's faster than adding them one by one on the admin race page.

## If the site itself is down
- Carry on with paper finish lists for every school, as before.
- If the site is reachable at all, **Download CSV** on the event page gives a copy of everything entered so far, finalised or not.
- Once it's back up, enter the paper lists through each school's teacher link as above.
- If data is lost or corrupted, restore from the branch taken the day before (Neon console → Branches → **Restore**), then re-enter anything added since.
