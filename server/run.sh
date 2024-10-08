echo "starting EXPIRED USER SESSION..."
python -u app.py --gpt_model=facebook/opt-1.3b \
                 --whisper_model=openai/whisper-base.en \
                 --bark_model=suno/bark --bark_text_temp=1.0 \
                 --bark_wave_temp=0.6 \
                 --gpt_temp=1.1 \
                 --gpt_top_k=50 \
                 --gpt_top_p=1.0 \
                 --wtpsplit_model=segment-any-text/sat-3l-sm