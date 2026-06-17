# assets/

Drop the packet image here with this exact name:

```
vahdam_packet_extracted_transparent.png
```

It should be a transparent PNG of the new packet. The pipeline composites it
over each hero image (centered, ~42% of the hero width by default) and saves
`ppNN_updated_hero.png`. Tune position/size in `src/config.ts` → `OVERLAY`.

If this file is missing, the pipeline still runs — it saves the original hero
and marks the Image Note as "Packet PNG not provided — overlay skipped".
