# Protein Intake Tracker

Live: https://cjfogerty.github.io/fogertycommunity/protein-tracker/

The hero image is being updated to use the exact faces from the original family photo of Norm and Mom (neck up) composited onto the muscular bodies in the green Family shirts.

Sheet is published and wired. Weight is optional and can be hidden.

## Editing past entries

Every entry in "History" has big **Edit** and **Delete** buttons. Edit opens the entry in place so you can change date, person, protein, weight (if shown) and notes, then **Save** or **Cancel**. Saving updates storage and refreshes the chart and stats immediately. Delete asks for confirmation.

Entries loaded from the published Google Sheet are read-only at the source, so edits/deletes to those rows are saved as **local overrides on this device** (localStorage key `fogerty_protein_sheet_overrides`), keyed by the row's original `date|person`. Each time the sheet loads, overrides are applied on top of it. The sheet itself is not changed, and other devices will not see these edits.
