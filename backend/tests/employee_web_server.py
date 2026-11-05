"""Standalone synthetic staff Web QA. Never reads the private CRS runtime."""
import os
from pathlib import Path
import uvicorn
ROOT=Path(__file__).resolve().parents[2]
os.environ['WEB_DIR']=str(ROOT/'web'/'dist')
from e2e_server import api
from app.main import User,Assignment,Site,hash_password
from sqlalchemy import select
with api.state.db() as db:
    second=User(login='foreman2',role='foreman',password_hash=hash_password('SyntheticPassword123'));db.add(second);db.flush()
    site=db.scalar(select(Site).where(Site.name=='Synthetic site A'))
    db.add(Assignment(user_id=second.id,site_id=site.id));db.commit()
if __name__=='__main__':uvicorn.run(api,host='127.0.0.1',port=58496)
